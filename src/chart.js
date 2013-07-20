"use strict";

// extend
// Borrowed from Underscore.js
function extend(object) {
	var argsIndex, argsLength, iteratee, key;
	if (!object) {
		return object;
	}
	argsLength = arguments.length;
	for (argsIndex = 1; argsIndex < argsLength; argsIndex++) {
		iteratee = arguments[argsIndex];
		if (iteratee) {
			for (key in iteratee) {
				object[key] = iteratee[key];
			}
		}
	}
	return object;
}

// initCascade
// Call the initialize method up the inheritance chain, starting with the
// base class and continuing "upward".
var initCascade = function(instance, args) {
	var ctor = this.constructor;
	var sup = ctor.__super__;
	if (sup) {
		initCascade.call(sup, instance, args);
	}

	// Do not invoke the `initialize` method on classes further up the
	// prototype chain (again).
	if (hasOwnProp.call(ctor.prototype, "initialize")) {
		this.initialize.apply(instance, args);
	}
};

// transformCascade
// Call the `transform` method down the inheritance chain, starting with the
// instance and continuing "downward". The result of each transformation should
// be supplied as input to the next.
var transformCascade = function(instance, data) {
	var ctor = this.constructor;
	var sup = ctor.__super__;

	// Unlike `initialize`, the `transform` method has significance when
	// attached directly to a chart instance. Ensure that this transform takes
	// first but is not invoked on later recursions.
	if (this === instance && hasOwnProp.call(this, "transform")) {
		data = this.transform(data);
	}

	// Do not invoke the `transform` method on classes further up the prototype
	// chain (yet).
	if (hasOwnProp.call(ctor.prototype, "transform")) {
		data = ctor.prototype.transform.call(instance, data);
	}

	if (sup) {
		data = transformCascade.call(sup, instance, data);
	}

	return data;
};

var Chart = function(selection) {

	this.base = selection;
	this._layers = {};
	this._mixins = [];
	this._events = {};

	initCascade.call(this, this, Array.prototype.slice.call(arguments, 1));
};

Chart.prototype.unlayer = function(name) {
	var layer = this.layer(name);

	delete this._layers[name];
	delete layer._chart;

	return layer;
};

Chart.prototype.layer = function(name, selection, options) {
	var layer;

	if (arguments.length === 1) {
		return this._layers[name];
	}

	// we are reattaching a previous layer, which the
	// selection argument is now set to.
	if (arguments.length === 2) {

		if (typeof selection.draw === "function") {
			selection._chart = this;
			this._layers[name] = selection;

			return this._layers[name];

		} else {
			d3Chart.assert(false, "When reattaching a layer, the second argument "+
				"must be a d3.chart layer");
		}
	}

	layer = selection.layer(options);

	this._layers[name] = layer;

	selection._chart = this;

	return layer;
};

Chart.prototype.initialize = function() {};

Chart.prototype.mixin = function(chartName, selection) {
	var args = Array.prototype.slice.call(arguments, 2);
	args.unshift(selection);
	var ctor = Chart[chartName];
	var chart = variadicNew(ctor, args);

	this._mixins.push(chart);
	return chart;
};

Chart.prototype.draw = function(data) {

	var layerName, idx, len;

	data = transformCascade.call(this, this, data);

	for (layerName in this._layers) {
		this._layers[layerName].draw(data);
	}

	for (idx = 0, len = this._mixins.length; idx < len; idx++) {
		this._mixins[idx].draw(data);
	}
};

Chart.prototype.on = function(name, callback, context) {
	var events = this._events[name] || (this._events[name] = []);
	events.push({
		callback: callback,
		context: context || this,
		_chart: this
	});
	return this;
};

Chart.prototype.once = function(name, callback, context) {
	var self = this;
	var once = function() {
		self.off(name, once);
		callback.apply(this, arguments);
	};
	return this.on(name, once, context);
};

Chart.prototype.off = function(name, callback, context) {
	var names, n, events, event, i, j;

	// remove all events
	if (arguments.length === 0) {
		for (name in this._events) {
			this._events[name].length = 0;
		}
		return this;
	}

	// remove all events for a specific name
	if (arguments.length === 1) {
		events = this._events[name];
		if (events) {
			events.length = 0;
		}
		return this;
	}

	// remove all events that match whatever combination of name, context
	// and callback.
	names = name ? [name] : Object.keys(this._events);
	for (i = 0; i < names.length; i++) {
		n = names[i];
		events = this._events[n];
		j = events.length;
		while (j--) {
			event = events[j];
			if ((callback && callback === event.callback) ||
					(context && context === event.context)) {
				events.splice(j, 1);
			}
		}
	}

	return this;
};

Chart.prototype.trigger = function(name) {
	var args = Array.prototype.slice.call(arguments, 1);
	var events = this._events[name];
	var i, ev;

	if (events !== undefined) {
		for (i = 0; i < events.length; i++) {
			ev = events[i];
			ev.callback.apply(ev.context, args);
		}
	}

	return this;
};

Chart.extend = function(name, protoProps, staticProps) {
	var parent = this;
	var child;

	// The constructor function for the new subclass is either defined by
	// you (the "constructor" property in your `extend` definition), or
	// defaulted by us to simply call the parent's constructor.
	if (protoProps && hasOwnProp.call(protoProps, "constructor")) {
		child = protoProps.constructor;
	} else {
		child = function(){ return parent.apply(this, arguments); };
	}

	// Add static properties to the constructor function, if supplied.
	extend(child, parent, staticProps);

	// Set the prototype chain to inherit from `parent`, without calling
	// `parent`'s constructor function.
	var Surrogate = function(){ this.constructor = child; };
	Surrogate.prototype = parent.prototype;
	child.prototype = new Surrogate();

	// Add prototype properties (instance properties) to the subclass, if
	// supplied.
	if (protoProps) { extend(child.prototype, protoProps); }

	// Set a convenience property in case the parent's prototype is needed
	// later.
	child.__super__ = parent.prototype;

	Chart[name] = child;
	return child;
};
