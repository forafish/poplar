var chai = require('chai');
var util = require('util');
var express = require('express');

var Poplar = require('../lib/poplar');
var ApiBuilder = require('../lib/api_builder');
var ApiMethod = require('../lib/api_method');
var Dynamic = require('../lib/dynamic');

var expect = chai.expect;

describe('Poplar', function() {

  var poplar, apiBuilder;

  beforeEach(function() {
    poplar = Poplar.create();
    apiBuilder = new ApiBuilder('test', { basePath: '/test' });
  });

  it('should inherites from EventEmitter', function() {
    expect(poplar).to.have.property('_events');
    expect(poplar).to.respondTo('listeners');
    expect(poplar).to.respondTo('on');
    expect(poplar).to.respondTo('emit');
  });

  describe('#create()', function() {
    it('should return a instance of Poplar after calling', function() {
      expect(Poplar.create()).to.be.an.instanceof(Poplar);
    });

  });

  describe('#use()', function() {
    it('can use a apiBuilder or create an apiBuilder by name and options', function() {
      poplar.use(apiBuilder);
      poplar.use('test1', {});
      expect(poplar._apiBuilders).to.have.all.keys(['test', 'test1']);
    });
  });

  describe('#allMethods()', function() {
    it('should return all methods', function() {
      apiBuilder.define('methodTest0', {}, function() {});
      apiBuilder.define('methodTest1', {}, function() {});
      apiBuilder.define('methodTest2', {}, function() {});
      apiBuilder.define('methodTest3', {}, function() {});

      var apiBuilder1 = new ApiBuilder('test1', {});

      apiBuilder.define('methodTest5', {}, function() {});
      apiBuilder.define('methodTest6', {}, function() {});
      apiBuilder.define('methodTest7', {}, function() {});
      apiBuilder.define('methodTest8', {}, function() {});

      poplar.use(apiBuilder);
      poplar.use(apiBuilder1);

      expect(poplar.allMethods()).to.have.length(8);
    });
  });

  describe('#handler("rest")', function() {
    it('should return an express Router', function() {
      var app = express();
      var fn = function() {
        app.use(poplar.handler('rest'));
      };
      expect(fn).to.not.throw(Error);
    });
  });

  describe('#adapter(name)', function() {
    it('should return cooresponding adapter via name', function() {
      expect(poplar.adapter('rest')).to.equal(require('../lib/adapters/rest'));
    });
  });

  describe('#defineType(name, func)', function() {
    it('should add a new converter to Dynamic', function() {
      Poplar.defineType('string', function() {});
      expect(Dynamic.converters).to.have.property('string');
      Dynamic.undefine('string');
    });
  });

  describe('#before(methodMatch, fn)', function() {
    it('should add a before hook', function() {
      poplar.before('users.login', function(ctx, next) { return; });
      expect(poplar._events).to.have.property('before.users.login')
    });
  });

  describe('#after(methodMatch, fn)', function() {
    it('should add a after hook', function() {
      poplar.after('users.login', function(ctx, next) { return; });
      expect(poplar._events).to.have.property('after.users.login')
    });
  });

  describe('#afterError(methodMatch, fn)', function() {
    it('should add a afterError hook', function() {
      poplar.afterError('users.login', function(ctx, next) { return; });
      expect(poplar._events).to.have.property('afterError.users.login')
    });
  });

  describe('#execHooks(when, method, ctx, next)', function() {
    var expectedResult = ['before_method_1', 'before_method_2', 'method', 'after_method_1', 'after_method_2', 'afterError'];
    var result, method;

    beforeEach(function(done) {
      result = [];
      generateExecuteHooks(result, poplar, apiBuilder, function() {
        method = apiBuilder.method('method');
        done();
      });
    });

    it('should execute before hooks in orders', function(done) {
      poplar.execHooks('before', method, {}, function() {
        expect(result).to.eql(['before_method_1', 'before_method_2']);
        done();
      });
    });

    it('should execute after hooks in orders', function(done) {
      poplar.execHooks('after', method, {}, function() {
        expect(result).to.have.members(['after_method_1', 'after_method_2']);
        expect(result).to.not.have.members(['before_method_1', 'before_method_2']);
        done();
      });
    });

    it('should execute afterError hook', function(done) {
      poplar.execHooks('afterError', method, {}, function() {
        expect(result).to.eql(['afterError']);
        done();
      });
    });
  });

  describe('#invokeMethodInContext(method, ctx, next)', function() {
    var expectedResult = ['before_method_1', 'before_method_2', 'method', 'after_method_1', 'after_method_2', 'afterError'];
    var result, method;

    beforeEach(function(done) {
      result = [];
      generateExecuteHooks(result, poplar, apiBuilder, function() {
        method = apiBuilder.method('method');
        done();
      });
    });

    it('should execute hooks for method in contexts as specified orders', function(done) {
      poplar.invokeMethodInContext(method, {}, function() {
        expect(result).to.eql(expectedResult);
        done();
      });
    });
  });

  describe('#searchListeners(methodName, type)', function() {
    var method;
    beforeEach(function(done) {
      generateExecuteHooks([], poplar, apiBuilder, function() {
        method = apiBuilder.method('method');
        done();
      });
    });

    it('should return all before hooks for target method', function() {
      expect(poplar.searchListeners(method.fullName(), 'before')).to.have.length(1);
      expect(poplar.searchListeners(method.fullName(), 'before')).to.eql(['before.test.method']);
    });

    it('should return all after hooks for target method', function() {
      expect(poplar.searchListeners(method.fullName(), 'after')).to.have.length(1);
      expect(poplar.searchListeners(method.fullName(), 'after')).to.eql(['after.test.method']);
    });

    it('should return all afterError hooks for target method', function() {
      expect(poplar.searchListeners(method.fullName(), 'afterError')).to.have.length(1);
      expect(poplar.searchListeners(method.fullName(), 'afterError')).to.eql(['afterError.test.method']);
    });
  });

  describe('#searchListenerTree(methodName, type)', function() {
    var method;
    beforeEach(function(done) {
      generateExecuteHooks([], poplar, apiBuilder, function() {
        method = apiBuilder.method('method');
        done();
      });
    });

    it('should return all before hooks\' name for target method', function() {
      expect(poplar.searchListenerTree(method.fullName(), 'before')).to.have.length(1);
      expect(poplar.searchListenerTree(method.fullName(), 'before')).to.eql(['before.test.method']);
    });

    it('should return all after hooks\' name for target method', function() {
      expect(poplar.searchListenerTree(method.fullName(), 'after')).to.have.length(1);
      expect(poplar.searchListenerTree(method.fullName(), 'after')).to.eql(['after.test.method']);
    });

    it('should return all afterError hooks\' name for target method', function() {
      expect(poplar.searchListenerTree(method.fullName(), 'afterError')).to.have.length(1);
      expect(poplar.searchListenerTree(method.fullName(), 'afterError')).to.eql(['afterError.test.method']);
    });
  });

});

function generateExecuteHooks(result, poplar, apiBuilder, done) {

  apiBuilder.define('method', {}, function(params, next) {
    result.push('method');
    next();
  });

  poplar.before('test.method', function(ctx, next) {
    result.push('before_method_1');
    next();
  });

  poplar.before('test.method', function(ctx, next) {
    result.push('before_method_2');
    next();
  });

  poplar.after('test.method', function(ctx, next) {
    result.push('after_method_1');
    next();
  });

  poplar.after('test.method', function(ctx, next) {
    result.push('after_method_2');
    next(new Error('afterError'));
  });

  poplar.afterError('test.method', function(ctx, next) {
    result.push('afterError');
    next(new Error('afterError'));
  });

  poplar.use(apiBuilder);

  done();
};
