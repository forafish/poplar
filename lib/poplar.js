/*!
 * Expose `Poplar`.
 */
module.exports = Poplar;

/*!
 * Module dependencies.
 */
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('poplar:apis');
var util = require('util');
var Url = require('url');
var inherits = util.inherits;
var assert = require('assert');
var path = require('path');
var _ = require('lodash');
var minimatch = require('minimatch');

var Dynamic = require('./dynamic');
var ApiBuilder = require('./api_builder');

function Poplar(options) {
  EventEmitter.call(this);
  // Avoid warning: possible EventEmitter memory leak detected
  this.setMaxListeners(16);
  this.options = options || {};
  this._apiBuilders = {};
  this._methods = {};
  this._listenerTree = {};
};

/*!
 * Simplified APIs
 */
Poplar.create = function(options) {
  return new Poplar(options);
};

/*!
 * Inherit from `EventEmitter`.
 */
inherits(Poplar, EventEmitter);


/**
 * Get all methods
 */
Poplar.prototype.allMethods = function() {
  return _.values(this._methods) || [];
};

/**
 * Use a ApiBuilder
 */
Poplar.prototype.use = function(name, options) {
  var apiBuilder = name;

  if (!(apiBuilder instanceof ApiBuilder)) {
    apiBuilder = new ApiBuilder(name, options);
  }

  name = apiBuilder.name;
  var self = this;

  // look up apiBuilder for the collection.
  if (!this._apiBuilders[name]) {
    if (apiBuilder) {
      // cache it so we only apply apiBuilders once
      this._apiBuilders[name] = apiBuilder;
      mergeListeners(apiBuilder);
      mergeMethods(apiBuilder);
    }
  } else {
    assert(false, util.format('Can\'t use the same ApiBuilder: %s more than once!', name));
  }

  // look up all ApiBuilder listeners then add it to api
  function mergeListeners(emitter) {
    var events = emitter._events;
    _.each(events, function(fns, type) {
      if (Array.isArray(fns)) {
        _.each(fns, function(fn) {
          if (_.isFunction(fn)) {
            self.on(type, fn);
          }
        })
      } else if (_.isFunction(fns)) {
        self.on(type, fns);
      }
    })
  };

  // look up all ApiBuilder methods then add it to api
  function mergeMethods(builder) {
    var methods = builder.methods();
    _.each(methods, function(fn, methodName) {
      // e.g.: users.getUserInfo
      self._methods[util.format('%s.%s', name, methodName)] = fn;
    });
  };

  // Analyze all listeners and parse them as tree
  this.analyzeListenerTree();
};

/**
 * Create a handler from the given adapter.
 *
 * @param {String} name Adapter name
 * @param {Object} options Adapter options
 * @return {Function}
 */
Poplar.prototype.handler = function(name, options) {
  var Adapter = this.adapter(name);
  var adapter = new Adapter(this, options);

  // create a handler from Adapter
  var handler = adapter.createHandler();

  if (handler) {
    // allow adapter reference from handler
    handler.adapter = adapter;
  }

  return handler;
};

/**
 * Get an adapter by name.
 * @param {String} name The adapter name
 * @return {Adapter}
 */
Poplar.prototype.adapter = function(name) {
  return require(path.join(__dirname, 'adapters', name));
};

/**
 * Define a named type conversion. The conversion is used when a
 * `ApiMethod` argument defines a type with the given `name`.
 *
 * ```js
 * api.defineType('MyType', function(val, ctx) {
 *   // use the val and ctx objects to return the concrete value
 *   return new MyType(val);
 * });
 * ```
 *
 * @param {String} name The type name
 * @param {Function} converter
 */
Poplar.defineType = function(name, fn) {
  Dynamic.define(name, fn);
};

/**
 * Execute the given function before the matched method string.
 *
 * **Examples:**
 *
 * ```js
 * // Do something before our `user.greet` example, earlier.
 * api.before('user.greet', function(ctx, next) {
 *   if ((ctx.req.param('password') || '').toString() !== '1234') {
 *     next(new Error('Bad password!'));
 *   } else {
 *     next();
 *   }
 * });
 *
 * // Do something before any `user` method.
 * api.before('user.*', function(ctx, next) {
 *   console.log('Calling a user method.');
 *   next();
 * });
 *
 * // Do something before a `dog` instance method.
 * api.before('dog.*', function(ctx, next) {
 *   var dog = this;
 *   console.log('Calling a method on "%s".', dog.name);
 *   next();
 * });
 * ```
 *
 * @param {String} methodMatch The glob to match a method string
 * @callback {Function} hook
 * @param {Context} ctx The adapter specific context
 * @param {Function} next Call with an optional error object
 * @param {ApiMethod} method The ApiMethod object
 */
Poplar.prototype.before = function(methodMatch, fn) {
  this.on('before.' + methodMatch, fn);
  // Analyze all listeners and parse them as tree
  this.analyzeListenerTree();
};

/**
 * Execute the given `hook` function after the matched method string.
 *
 * **Examples:**
 *
 * ```js
 * // Do something after the `speak` instance method.
 * // NOTE: you cannot cancel a method after it has been called.
 * api.after('dog.speak', function(ctx, next) {
 *   console.log('After speak!');
 *   next();
 * });
 *
 * // Do something before all methods.
 * api.before('**', function(ctx, next, method) {
 *   console.log('Calling:', method.name);
 *   next();
 * });
 *
 * // Modify all returned values named `result`.
 * api.after('**', function(ctx, next) {
 *   ctx.result += '!!!';
 *   next();
 * });
 * ```
 *
 * @param {String} methodMatch The glob to match a method string
 * @callback {Function} hook
 * @param {Context} ctx The adapter specific context
 * @param {Function} next Call with an optional error object
 * @param {ApiMethod} method The ApiMethod object
 */
Poplar.prototype.after = function(methodMatch, fn) {
  this.on('after.' + methodMatch, fn);
  // Analyze all listeners and parse them as tree
  this.analyzeListenerTree();
};

/**
 * Execute the given `hook` function after the method matched by the method
 * string failed.
 *
 * **Examples:**
 *
 * ```js
 * // Do something after the `speak` instance method failed.
 * api.afterError('dog.speak', function(ctx, next) {
 *   console.log('Cannot speak!', ctx.error);
 *   next();
 * });
 *
 * // Do something before all methods.
 * api.afterError('**', function(ctx, next, method) {
 *   console.log('Failed', method.name, ctx.error);
 *   next();
 * });
 *
 * // Modify all returned errors
 * api.after('**', function(ctx, next) {
 *   if (!ctx.error.details) ctx.result.details = {};
 *   ctx.error.details.info = 'intercepted by a hook';
 *   next();
 * });
 *
 * // Report a different error
 * api.after('dog.speak', function(ctx, next) {
 *   console.error(ctx.error);
 *   next(new Error('See server console log for details.'));
 * });
 * ```
 *
 * @param {String} methodMatch The glob to match a method string
 * @callback {Function} hook
 * @param {Context} ctx The adapter specific context
 * @param {Function} next Call with an optional error object
 * @param {ApiMethod} method The ApiMethod object
 */
Poplar.prototype.afterError = function(methodMatch, fn) {
  this.on('afterError.' + methodMatch, fn);
  // Analyze all listeners and parse them as tree
  this.analyzeListenerTree();
};

/*!
 * Execute Hooks by type and method.
 */
Poplar.prototype.execHooks = function(when, method, ctx, next) {
  var methodName = method.fullName();
  var stack = [];

  var listenerNames = this.searchListenerTree(methodName, when);

  if (_.isEmpty(listenerNames)) {
    listenerNames = this.searchListeners(methodName, when);
  }

  var self = this;

  listenerNames.forEach(function(listenerName) {
    addToStack(self.listeners(listenerName));
  });

  function addToStack(fn) {
    stack = stack.concat(fn);
  }

  function execStack(err) {
    if (err) return next(err);

    var cur = stack.shift();

    if (cur) {
      try {
        var result = cur.call(method, ctx, execStack, method);
        if (result && typeof result.then === 'function') {
          result.then(function() { next(); }, next);
        }
      } catch (err) {
        next(err);
      }
    } else {
      next();
    }
  }

  return execStack();
};

/**
 * Invoke the given api method using the supplied context.
 * Execute registered before/after hooks.
 * @param {Object} ctx
 * @param {Object} method
 * @param {function(Error=)} cb
 */
Poplar.prototype.invokeMethodInContext = function(method, ctx, cb) {
  var self = this;

  self.execHooks('before', method, ctx, function(err) {
    if (err) return triggerErrorAndCallBack(err);

    method.invoke(ctx, function(err, result) {
      ctx.result = result;
      if (err) return cb(err);

      self.execHooks('after', method, ctx, function(err) {
        if (err) return triggerErrorAndCallBack(err);
        cb();
      });
    });

  });

  function triggerErrorAndCallBack(err) {
    ctx.error = err;
    self.execHooks('afterError', method, ctx, function(hookErr) {
      cb(hookErr || err);
    });
  }
};

/*!
 * Search listeners before or after a given method is called
 * @param {String} methodName name for method
 * @param {String} type: `before`, `after`, `afterError`
 */
Poplar.prototype.searchListeners = function(methodName, type) {
  var allListenerNames = Object.keys(this._events);
  var listenerNames = [];
  var fullType = util.format('%s.%s', type, methodName);
  _.each(allListenerNames, function(name) {
    if (minimatch(fullType, name)) {
      listenerNames.push(name);
    }
  })
  return listenerNames;
};

/*!
 * Search listenerTree before or after a given method is called
 * @param {String} methodName name for method
 * @param {String} type: `before`, `after`, `afterError`
 */
Poplar.prototype.searchListenerTree = function(methodName, type) {
  var listeners = this._listenerTree[methodName];
  if (listeners) {
    return listeners[type];
  } else {
    return [];
  }
};

/*!
 * Analyze all listeners coorespond with methods
 *
 * {
 *   'users.info': {
 *     before: ['before.users.*', 'before.users.info'],
 *     after: ['after.users.*', 'after.users.info'],
 *     afterError: ['afterError.users.*', 'afterError.users.info']
 *   }
 * }
 */
Poplar.prototype.analyzeListenerTree = function() {
  var methods = this._methods;
  var listenerTree = {};
  var self = this;

  _.each(methods, function(fn, name) {
    listenerTree[name] = listenerTree[name] || {};
    ['before', 'after', 'afterError'].forEach(function(type) {
      listenerTree[name][type] = self.searchListeners(name, type) || [];
    });
  });

  this._listenerTree = listenerTree;
};
