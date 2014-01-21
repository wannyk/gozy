"use strict";

var cluster = require('cluster'),
	redis = require('redis');

var STORAGE_TYPE= 'storage_type',
	SUPPORT_STORAGE_TYPES = ['HASH', 'STRING', 'SORTEDSET', 'SET'],
	__primary_key__ = '___Id___',
	__value_key__ = ' ___Val___',
	__DBNAME__ = 'db_name';

function Redis(name, options) {
	this.name = name;
	this.host = options.host || 'localhost';
	this.port = options.port || 6379;
	this.password = options.password;
}

Redis.prototype.connect = function (cb) {
	if(this.host && this.port) {
		if(cluster.isMaster) global.gozy.info('Connecting to Redis "' + this.name + '"(' + this.host + ':' + this.port + ' ' + (this.password ? 'with password)' : 'without password)'));
		
		this.redis = redis.createClient(this.port, this.host, null);
		this.redis.on('error', function (err) {
			global.gozy.error(err);
			cb && cb();
		});
		
		var name = this.name;
		
		if(this.password) {
			this.redis.auth(this.password, function(arg) {
				if(cluster.isMaster) global.gozy.info('Successfully connected to ' + name);
				cb && cb();	
			});	
		} else {
			if(cluster.isMaster) global.gozy.info('Successfully connected to ' + name);
			cb && cb();
		}
	} else {
		if(cluster.isMaster) global.gozy.error('Redis connection failed');
		cb && cb();
	}
};

Redis.prototype.clone = function (cb) {
	var _new = new Redis(this.name, {
		host: this.host, 
		port: this.port, 
		password: this.password 	
	});
	
	_new.redis = redis.createClient(_new.port, _new.host, null);
	_new.redis.on('error', function (err) {
		global.gozy.error(err);
	});
	
	if(_new.password) {
		_new.redis.auth(_new.password, function(arg) {
			return cb(null, _new);	
		});	
	} else {
		return cb(null, _new);
	}
};

Redis.prototype.attachModel = function (model) {
	var type = model._opt.type,
		defaults = model._opt.defaults,
		name = model._filename,
		self = this;
	if(!type && cluster.isMaster) return global.gozy.error('Model for Redis, "' + name + '", does not specify data type');
	if(!defaults && cluster.isMaster) global.gozy.warn('Model for Redis, "' + name + '", does not have default values');
	if(!name && cluster.isMaster) return global.gozy.error('illegal `require` for the redis model');
	if(model._opt.enableSubscription) {
		if(cluster.isMaster) global.gozy.info(this.name + '\'s model ' + name + ' has enabled subscription mode');
		this.clone(function (err, subinst) {
			if(err && cluster.isMaster) return global.gozy.error(err);
			self.subscription_redis = subinst.redis;
			self.subscription_redis.setMaxListeners(0);
		});
	}
	
	model[name] = this.generateModel(name, defaults);
	model[name].prototype.key = this.generateKeyFunction();
		
	var enums = explicitEnumerations(defaults); 
	if(enums) model.ENUM = enums;
	
	var me = this;
	['del', 'keys', 'pttl'].forEach(function (cmd) {
		model[cmd] = me.KEY_FUNC(model[name], cmd, name + '.');
	});
	
	['pexpire', 'expire'].forEach(function (cmd) {
		model[cmd] = me.KEY_ARG1_FUNC(model[name], cmd, name + '.');
	});
	
	
	var subscription_map = {},
		subscription_map_idx = 0;
	
	model.publish = function (channel, message) {
		self.redis.publish(name + '.CHANNEL.' + channel, message);
	};
	
	model.subscribe = function (channel, cb) {
		if(!self.subscription_redis) return global.gozy.error('Trying to subscribe "subscription" disabled redis model "' + name + '." Try to use "enableSubscription: true"');
		
		var func = function (c, m) {
			if(c == (name + '.CHANNEL.' + channel)) return cb(channel, m);
		};
		
		subscription_map[subscription_map_idx] = func;
		
		self.subscription_redis.subscribe(name + '.CHANNEL.' + channel);
		self.subscription_redis.on('message', func);
		
		return subscription_map_idx++;
	};
	
	model.unsubscribe = function (channel, idx) {
		if(!self.subscription_redis) return global.gozy.error('Trying to unsubscribe "subscription" disabled redis model "' + name + '." Try to use "enableSubscription: true"');
		self.subscription_redis.unsubscribe(name + '.CHANNEL.' + channel);
		if(typeof idx == 'number' && idx >= 0) {
			if(subscription_map[idx]) self.subscription_redis.removeListener('message', subscription_map[idx]);
			delete subscription_map[idx];
		}
	};

	['del', 'ttl', 'pttl'].forEach(function (cmd) {
		model[name].prototype[cmd] = me.SELFKEY_FUNC(model[name], cmd, name + '.');
	});
			
	['pexpire', 'expire'].forEach(function (cmd) {
		model[name].prototype[cmd] = me.SELFKEY_ARG1_FUNC(model[name], cmd, name + '.');
	});
	
	switch(type) {
	case 'HASH':
		['hgetall'].forEach(function (cmd) {
			model[cmd] = me.KEY_GETFUNC(model[name], cmd, name + '.');
		});
		['hget', 'hmset', 'hmget', 'hdel'].forEach(function (cmd) {
			model[cmd] = me.KEY_ARG1_FUNC(model[name], cmd, name + '.');
		});
		['hset'].forEach(function (cmd) {
			model[cmd] = me.KEY_ARG1_ARG2_FUNC(model[name], cmd, name + '.');
		});
		['hmset'].forEach(function (cmd) {
			model[name].prototype[cmd] = me.SELFKEY_HMSETFUNC(model[name], cmd, name + '.', defaults);
		});
		break;
	case 'SET':
		['spop', 'scard', 'smembers'].forEach(function (cmd) {
			model[cmd] = generate_redis_func.KEY_FUNC.call(model[name], cmd, name + '.', model[name]);
		});
		['sadd', 'srem'].forEach(function (cmd) {
			model[cmd] = generate_redis_func.KEY_ARG1_FUNC.call(model[name], cmd, name + '.');
		});
		break;
	case 'SORTEDSET':
		['zcard'].forEach(function (cmd) {
			model[cmd] = generate_redis_func.KEY_FUNC.call(model[name], cmd, name + '.', model[name]);
		});
		['zscore', 'zrank', 'zrevrank'].forEach(function (cmd) {
			model[cmd] = generate_redis_func.KEY_ARG1_FUNC.call(model[name], cmd, name + '.');
		});
		['zincrby', 'zadd'].forEach(function (cmd) {
			model[cmd] = generate_redis_func.KEY_ARG1_ARG2_FUNC.call(model[name], cmd, name + '.');
		});
		['zrange', 'zrevrange'].forEach(function (cmd) {
			model[cmd] = generate_redis_func.KEY_ARG1_ARG2_ARG3_FUNC.call(model[name], cmd, name + '.');
		});
		break;
	case 'STRING':
		['get'].forEach(function (cmd) {
			model[cmd] = me.KEY_GETFUNC(model[name], cmd, name + '.');
		});
		['getset'].forEach(function (cmd) {
			model[cmd] = me.KEY_ARG1_GETFUNC(model[name], cmd, name + '.');
		});
		['set', 'setnx'].forEach(function (cmd) {
			model[name].prototype[cmd] = me.SELFKEY_SETFUNC(model[name], cmd, name + '.');
		});
		['psetex', 'setex'].forEach(function (cmd) {
			model[name].prototype[cmd] = me.SELFKEY_ARG1_SETFUNC(model[name], cmd, name + '.');
		});
		['mget'].forEach(function (cmd) {
			model[cmd] = me.KEYARRAY_FUNC(model[name], cmd, name + '.');
		});
		break;
	
	}

	model.emit('initialize', model[name]);
};

function explicitEnumerations(def) {
	var enums = {};
	for(var key in def) {
		if(def[key].type === 'ENUM') {
			enums[key.toUpperCase()] = {};
			for(var i=0; i<def[key].enum.length; i++)
				enums[key.toUpperCase()][def[key].enum[i].toUpperCase()] = def[key].enum[i]; 
		}
	}
	return enums;
}

Redis.prototype.generateModel = function (name, def) {
	return function (obj, pk) {
		if(!obj) obj = {};
		for(var key in def) {
			if(obj[key] != undefined && obj[key] != null) {
				if(typeof obj[key] === 'string') {
					switch(def[key].type) {
					case 'BINARY': this[key] = new Buffer(obj[key], 'hex'); break;
					case 'TIMESTAMP': this[key] = new Date(obj[key]); break;
					case 'OBJECT': 
						try { this[key] = JSON.parse(obj[key]); }
						catch (e) { throw new Error('Value of ' + key + ' is not a JSON object'); }
						break;
					case 'INTEGER': this[key] = parseInt(obj[key]); break;
					case 'FLOAT': this[key] = parseFloat(obj[key]); break;
					case 'ENUM':
					case 'STRING': this[key] = obj[key]; break;
					default: global.gozy.warn('Unknown data type ' + def[key].type + ' in ' + name); break;
					}
				} else
					this[key] = obj[key];
			} else
				this[key] = undefined;
			delete obj[key];
		}
		
		for(var key in obj)
			this[key] = obj[key];
			
		this[__primary_key__] = pk;
	};
}

Redis.prototype.generateKeyFunction = function () {
	return function (val) {
		if(val !== undefined) this[__primary_key__] = val;
		else return this[__primary_key__];
	};
};

Redis.prototype.KEY_FUNC = function (model, func_name, name) {
	var me = this;
	return function (key, cb) {
		try {
			if(!cb) return cb(new Error('no callback function is defined in ' + func_name + ', ' + name));
			
			if(!isNULL(key)) return me.redis[func_name](name + key, cb);
			else return cb(new Error('null key for ' + name));
		} catch (e) { cb(e); }
	};
};

Redis.prototype.KEY_GETFUNC = function (model, func_name, name) {
	var me = this;
	return function (key, cb) {
		try {
			if(!cb) return cb(new Error('no callback function is defined in ' + func_name + ', ' + name));
			if(!isNULL(key)) return me.redis[func_name](name + key, function (err, result) {
				if(err || !result) return cb(err, null);
				if(typeof result === 'string') result = JSON.parse(result);
				return cb(null, new model(result, key));
			});
			else return cb(new Error('null key for ' + name));
		} catch (e) { cb(e); }
	};
};

Redis.prototype.KEY_ARG1_GETFUNC = function (model, func_name, name) {
	var me = this;
	return function (key, arg1, cb) {
		try {
			if(!cb) return cb(new Error('no callback function is defined in ' + func_name + ', ' + name));
			if(!isNULL(key)) return me.redis[func_name](name + key, arg1, function (err, result) {
				if(err || !result) return cb(err, null);
				if(typeof result === 'string') result = JSON.parse(result);
				return cb(null, new model(result, key));
			});
			else return cb(new Error('null key for ' + name));
		} catch (e) { cb(e); }
	};
};


Redis.prototype.KEY_ARG1_FUNC = function (model, func_name, name) {
	var me = this;
	return function (key, arg1, cb) {
		try {
			if(!cb) return cb(new Error('no callback function is defined in ' + func_name + ', ' + name));
			
			if(!isNULL(key)) return me.redis[func_name](name + key, arg1, cb);
			else return cb(new Error('null key for ' + name));
		} catch (e) { cb(e); }
	};
};
	
Redis.prototype.KEY_ARG1_ARG2_FUNC = function (model, func_name, name) {
	var me = this;
	return function (key, arg1, arg2, cb) {
		try {
			if(!cb) return cb(new Error('no callback function is defined in ' + func_name + ', ' + name));
			
			if(!isNULL(key)) return me.redis[func_name](name + key, arg1, arg2, cb);
			else return cb(new Error('null key for ' + name));
		} catch (e) { cb(e); }
	};
};

Redis.prototype.KEYARRAY_FUNC = function (model, func_name, name) {
	var me = this;
	return function (arr, cb) {
		try {
			if(!cb) return cb(new Error('no callback function is defined in ' + func_name + ', ' + name));
			
			if(!arr) return cb(new Error('null key for ' + name));
			if(arr.length === 0) return cb(null, []);
			
			return me.redis[func_name](arr, function (err, _results) {
				if(err) return cb(err);
				for(var i=0; i<_results.length; i++) {
					if(typeof _results[i] === 'string')
						_results[i] = new model(JSON.parse(_results[i]), arr[i]);
				}
				return cb(null, _results);					
			});
		} catch (e) { cb(e); }
	};
};

Redis.prototype.RAW_FUNC = function (model, func_name) {
	var me = this;
	return function () {
		console.log(arguments);
		return me.redis[func_name].apply(me.redis, arguments);
	};
};

Redis.prototype.KEY_ARG1_ARG2_ARG3_FUNC = function (func_name, name){
	var me = this;
	return function (key, arg1, arg2, arg3, cb) {
		try {
			if(!cb) return cb(new Error('no callback function is defined in ' + func_name + ', ' + name));
			if(arg3 !== undefined && !isNULL(key)) return me.redis[func_name](name + key, arg1, arg2, arg3, cb);
			else if(!isNULL(key)) return me.redis[func_name](name + key, arg1, arg2, cb);
			else return cb(new Error('null key for ' + name));
		} catch (e) { cb(e); }
	};
};

Redis.prototype.SELFKEY_FUNC = function (model, func_name, name) {
	var me = this;
	return function (cb) {
		try {
			if(!cb) return cb(new Error('no callback function is defined in ' + func_name + ', ' + name));
				
			var key = this[__primary_key__];
				
			if(!isNULL(key)) return me.redis[func_name](name + key, cb);
			else return cb(new Error('null key for ' + name));
		} catch (e) { cb(e); }
	};
};

Redis.prototype.SELFKEY_ARG1_FUNC = function (model, func_name, name) {
	var me = this;
	return function (arg1, cb) {
		try {
			if(!cb) return cb(new Error('no callback function is defined in ' + func_name + ', ' + name));
				
			var key = this[__primary_key__];
				
			if(!isNULL(key)) return me.redis[func_name](name + key, arg1, cb);
			else return cb(new Error('null key for ' + name));
		} catch (e) { cb(e); }
	};
};
	
/***************** Only for String Model *****************/
Redis.prototype.SELFKEY_SETFUNC = function (model, func_name, name, value_name, value_type) {
	var me = this;
	return function (cb) {			
		try {
		if(!cb) throw new Error('no callback function is defined in ' + func_name + ', ' + name);
			var key = this[__primary_key__];
			delete this[__primary_key__];
			var data = JSON.stringify(this);
			this[__primary_key__] = key;
			
			if(!isNULL(key)) return me.redis[func_name](name + key, data, cb);
			else throw new Error('null key for ' + name);
		} catch (e) { cb(e); }
	};
};

Redis.prototype.SELFKEY_ARG1_SETFUNC = function (model, func_name, name, value_name, value_type) {
	var me = this;
	return function (arg1, cb) {			
		try {
			if(!cb) throw new Error('no callback function is defined in ' + func_name + ', ' + name);
			var key = this[__primary_key__];
			delete this[__primary_key__];
			var data = JSON.stringify(this);
			this[__primary_key__] = key;
			
			if(!isNULL(key)) return me.redis[func_name](name + key, arg1, data, cb);
			else throw new Error('null key for ' + name);
		} catch (e) { cb(e); }
	};
};

/***************** Only for Hash Model *****************/
Redis.prototype.SELFKEY_HMSETFUNC = function (model, func_name, name, def) {
	var me = this;
	return function (cb) {			
		try {
			if(!cb) throw new Error('no callback function is defined in ' + func_name + ', ' + name);
				
			var key = this[__primary_key__],
				obj = {};
			
			for(var objkey in def) {
				if(this[objkey] != undefined && this[objkey] != null) {
					switch(def[objkey].type) {
					case 'BINARY': obj[objkey] = this[objkey].toString('hex'); break;
					case 'TIMESTAMP': obj[objkey] = this[objkey].toGMTString(); break;
					case 'OBJECT': obj[objkey] = JSON.stringify(this[objkey]); break;
					case 'INTEGER': 
					case 'FLOAT': 
					case 'ENUM':
					case 'STRING': obj[objkey] = this[objkey].toString(); break;
					default: global.gozy.warn('Unknown data type ' + def[objkey].type + ' in ' + name); break;
					}	
				}
			}
			if(!isNULL(key)) return me.redis[func_name](name + key, obj, cb);
			else throw new Error('null key for ' + name);
		} catch (e) { cb(e); }
	};
};

function isNULL(val) {
	return val === undefined || val === null;
}

module.exports = Redis;