/*!
 * Expose `invokeValidations`.
 */
module.exports = Validate;

/*!
 * Module dependencies.
 */
var _ = require('lodash');
var Validator = require('validator');
var util = require('util');
var helper = require('./helper');
var debug = require('debug')('poplar:validation');

/**
 * @class A wrapper to collect validation errors.
 *
 * @constructor
 * Create a new `ValidationError` with the given `options`.
 */
function ValidationError() {
  this._errors = {};
};

/**
 * add a new validation error
 * {
 *   email: { isEmail: 'not a valid email' }
 * }
 */
ValidationError.prototype.add = function(name, validatorName, msg) {
  msg = msg || this.defaultMessage(name, validatorName);
  var obj = this._errors[name] || {};
  obj[validatorName] = msg;
  this._errors[name] = obj;
};


/**
 * To human readable format
 *   example:  email is not a valid; name is required
 */
ValidationError.prototype.toHuman = function() {
  return this.flatten().join('; ');
};

/**
 * Flatten Error Message
 *   example:  ['email is not a valid', 'name is required']
 */

ValidationError.prototype.flatten = function() {
  var self = this;
  var messages;
  messages = _.map(self._errors, function(obj, name) {
    return _.map(obj, function(msg, validatorName) {
      return msg.toString() || self.defaultMessage(name, validatorName);
    });
  });
  return _.flatten(messages);
};

/**
 * To JSON  format
 */
ValidationError.prototype.asJSON = function() {
  return this._errors;
};

/**
 * Default message format
 */
ValidationError.prototype.defaultMessage = function(name, validatorName) {
  return util.format('%s: \'%s\' validation failed', name, validatorName);
};

/**
 * Check if there exists any error
 */
ValidationError.prototype.any = function() {
  return !_.isEmpty(this._errors);
};

/**
 * Iterate all accepts and params to check validations
 * Usage:
 *    validates: {
 *      required: { message: 'email is required' },
 *      isEmail: { message: 'not a valid email' },
 *      isLengthEnough: function(input) {
 *        if (!!input.length > 8) {
 *          return 'email's length should longer than 8';
 *        }
 *      }
 *    }
 */
function Validate(params, accepts) {

  var validationError = new ValidationError();
  params = params || {};
  accepts = accepts || [];

  _.each(accepts, function(accept) {
    var name = accept.arg;
    var val = params[name];

    var validators = _.extend({}, accept.validates);
    if (validators && _.isPlainObject(validators)) {

      if (helper.isEmpty(val)) {
        // check if value exists
        if (validators.hasOwnProperty('required')) {
          if (_.isFunction(validators.required)) {
            try {
              var result = validators.required(val, params);
              if (result) {
                validationError.add(name, 'required', result);
              }
            } catch (e) {
              debug('Error: \'%s\' when calling function \'%s\'', e.message, 'required');
            }
          } else if (validators.required) {
            validationError.add(name, 'required', validators.required['message']);
          }
          delete validators['required'];
        }
      } else {
        delete validators['required'];
        _.each(validators, function(validatorOpts, validatorName) {
          validatorOpts = validatorOpts || {};
          if (_.isFunction(validatorOpts)) {
            try {
              var result = validatorOpts(val, params);
              if (result) {
                validationError.add(name, validatorName, result);
              }
            } catch (e) {
              debug('Error: \'%s\' when calling function \'%s\'', e.message, validatorName);
            }
          } else {
            if (!validatorOpts) { return; };
            var validator = Validator[validatorName];
            var args = [val];

            if (validatorOpts && validatorOpts.args) {
              args.push(validatorOpts.args);
              args = _.flatten(args);
            }

            if (validator && _.isFunction(validator)) {
              // if validation failed, then add error message
              if (!validator.apply(Validator, args)) {
                validationError.add(name, validatorName, validatorOpts && validatorOpts.message);
              }
            } else {
              debug('Validator \'%s\' is not defined', validatorName);
            }
          }
        })
      }
    }
  });
  return validationError;
};

Validate.Validator = Validator;
