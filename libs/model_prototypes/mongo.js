"use strict";

var cluster = require('cluster');
var _ = require('underscore'),
	mongo = require('mongodb'),
	ObjectID = mongo.ObjectID,
	Collection = mongo.Collection;
var __primary_key__ = '_id';

function Mongo(name, options) {
	this.name = name;
	this.host = options.host || 'localhost';
	this.port = options.port || 27017;
	this.database = options.database || 'test';
	this.username = options.username;
	this.password = options.password;
}

Mongo.prototype.connect = function (cb) {	
	if(cluster.isMaster) global.gozy.info('Connecting to MongoDB "' + this.name + '(' + this.host + ':' + this.port + ' ' + (this.password && this.username ? 'with password)"' : 'without password)"'));
		
	var client = new mongo.Db(this.database, new mongo.Server(this.host, this.port, {}), { safe: false });
	client.open(_.bind(function (err, p_client) {
		if(err) return cb(err);
		
		if(this.username && this.password) {
			p_client.authenticate(this.username, this.password, _.bind(function (err, res) {
				if(err) return cb(err);
				else if(!res) return cb(new Error('Mongo "' + this.name + '" authentication failed'));
			
				if(cluster.isMaster) global.gozy.info('Successfully connected to ' + this.name);
				this.client = p_client;
				cb && cb();
			}, this));	
		} else {
			if(cluster.isMaster) global.gozy.info('Successfully connected to ' + this.name);
			this.client = p_client;
			cb && cb();
		}
	}, this));
};

Mongo.prototype.attachModel = function (model) {
	var collection_name = model._filename,
		defaults = model._opt && model._opt.defaults;
		
	model[collection_name] = this.generate_model(defaults);
	model[collection_name].prototype.id = this.generate_key_function();
	model[collection_name].prototype.save = this.generate_save(collection_name);
	model[collection_name].prototype.update = this.generate_update(collection_name);
	model[collection_name].prototype.del = this.generate_del(collection_name);
	model.findById = this.generate_findById(collection_name, model[collection_name]);
	model.find = this.generate_find(collection_name, model[collection_name]);
	model.remove = this.generate_remove(collection_name, model[collection_name]);
	model.ensureIndex = this.generate_ensureIndex(collection_name);
	model.ObjectID = ObjectID;
	
	model.emit('initialize', model[collection_name]);
};

Mongo.prototype.generate_model = function (defaults) {
	return function (val) {
		_.extend(this, defaults, val);
	};
};

Mongo.prototype.generate_key_function = function () {
	return function (val) {
		if(val !== undefined) {
			if(typeof val === 'string')
				this[__primary_key__] = new ObjectID(val);
			else
				this[__primary_key__] = val;
		}
		else return this[__primary_key__];
	};
};

Mongo.prototype.generate_update = function (name) {
	var m = this;
	return function () {
		var collection = new Collection(m.client, name);
		var _arguments = [], criteria = {};
		criteria[__primary_key__] = this[__primary_key__];
		_arguments.push(criteria);
		for(var i=0; i<arguments.length; i++)
			_arguments.push(arguments[i]);
		collection.update.apply(collection, _arguments);
	};
};

Mongo.prototype.generate_del = function (name) {
	var m = this;
	return function () {
		var collection = new Collection(m.client, name);
		var _arguments = [], criteria = {};
		criteria[__primary_key__] = this[__primary_key__];
		_arguments.push(criteria);
		for(var i=0; i<arguments.length; i++)
			_arguments.push(arguments[i]);
		collection.remove.apply(collection, _arguments);
	};
};

Mongo.prototype.generate_save = function (name) {
	var m = this;
	return function (cb, safe) {
		var collection = new Collection(m.client, name);
		if(!this[__primary_key__]) {
			collection.insert(this, {safe: safe === undefined ? true : false}, function (err, res) {
				if(err) return cb(err);
				if(res.length > 0) return cb && cb(err, res[0]);
				return cb && cb(err, null);
			});
		} else {
			var criteria = { };
			criteria[__primary_key__] = this[__primary_key__];
			
			collection.update(criteria, this, {safe: safe === undefined ? true : safe}, _.bind(function(err) {
				if (err) return cb && cb(err);
				return cb && cb(err, this);
			}, this));
		}	
	};
};

Mongo.prototype.generate_findById = function (name, model) {
	var m = this;
	return function (Id, cb) {
		var q = {};
		if(typeof Id === 'string')
			q[__primary_key__] =  new ObjectID(Id);
		else 
			q[__primary_key__] =  Id;
		
		(new Collection(m.client, name)).find(q).toArray(function (err, docs) {
			if(err) return cb(err);
			if(docs.length === 0) return cb(null, null);
			return cb(null, new model(docs[0]));
		});
	};
};

Mongo.prototype.generate_ensureIndex = function (name) {
	var m = this;
	
	return function () {
		var collection = (new Collection(m.client, name));
		return collection.ensureIndex.apply(collection, arguments);
	};
};

function CursorWrapper(cursor, model) {
	this._cursor = cursor;
	this._model = model;
}

CursorWrapper.prototype.toArray = function (cb) {
	this._cursor.toArray(_.bind(function (err, items) {
		if(err) return cb(err);
		for(var i=0; i<items.length ;i++)
			items[i] = new (this._model)(items[i]);
		return cb(err, items);
	}, this));
};

['limit', 'skip', 'sort', 'explain'].forEach(function (method) {
	CursorWrapper.prototype[method] = function () {
		this._cursor[method].apply(this._cursor, arguments);
		return this;
	};
});

Mongo.prototype.generate_find = function (name, model) {
	var m = this;
	return function (cond, cb) {
		(new Collection(m.client, name)).find(cond, function (err, cursor) {
			if(err) return cb(err);
			return cb(null, new CursorWrapper(cursor, model));
		});
	};
};

Mongo.prototype.generate_remove = function (name, model) {
	var m = this;
	return function (cond, cb) {
		(new Collection(m.client, name)).remove(cond, cb);
	};
};


module.exports = Mongo;
