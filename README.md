gozy
====

Go crazy

Install
=======
	npm install gozy

Main Usge
=========
```
var http = require('http').createServer().listen(80),
	gozy = require('gozy');

gozy.bindModels('application/model/')
	.bindControllers('application/controller')
	.bindMongo('MyMongoDB', {
		'host': 'localhost',
		'port': 27017,
		"username": "username",
		"password": "password",
		"database": "database"
	})
	.bindRedis('MyRedis', {
		'host': 'localhost',
		'port': 6379,
		"password": "password"
	})
	.bindMySQL('MyMySQL', {
		'host': 'localhost',
		'port': 3306,
		"username": "username",
		"password": "password",
		"database": "database"
	})
	.bindMailer('MyMailer', { /* this option is used for nodemailer package option */
		'host': 'smtp.host.com',
		secureConnection: false,
		port: 587,
		auth: {
			user: 'sender@mail.me',
			pass: 'password!!'
		}
	})
	.enableWebSocket()
	.listen(http);
```

View Usage
================
'''
require('gozy').View(this, {
	'accept-url': /^\/path\/to\/resource$/,
	'accept-method': 'GET'
});

this.on('initialize', function () {
	
});

this.on('prerequest', function (request, response, done) {
	return done({ authentication: true });
});

this.on('*/*', function (request, response, preq_args) {
	if(preq_args.authentication)
		return response.OK().commit();
	else
		return response.Forbidden().commit(); 
});
'''

MongoDB Model Usage
===================
'''
require('gozy').Model(this, 'MyMongoDB', {
	defaults: {
		Name: null,
		Mode: 0
	}
});

this.on('initialize', function (model) {
	model.prototype.setName = setName;	
});
'''

MySQL Model Usage
===================
'''
require('gozy').Model(this, 'MyMySQL', {
	schema: {
		id: { Id: true, type: 'INTEGER' },
		Name: { type: 'STRING' },
		Password: { type: 'BINARY' },
		DateLastUpdated: { type: 'TIMESTAMP' }
	}
});

this.on('initialize', function (model) {
	model.prototype.setName = setName;	
});
'''

Redis Model Usage
===================
#### MyStringModel.js
'''
require('gozy').Model(this, 'MyRedis', {
	type: 'STRING',
	defaults: {
		Name: { type: 'OBJECT' }
	}
});

this.on('initialize', function (model) {
});

exports.createNew = function (cb) {
	var model = exports.MyStringModel({ name: { prop1: 'value1 will be converted to JSON', prop2: 'value2 will be converted to JSON' });
	model.key('this_is_Redis_key');
	model.setnx(function (err, saved) {
		if(err) return cb(err);
		if(saved > 0) return cb(null, model);
		else return cb(null, null); 
	});	
};

'''

#### MyHashModel.js
'''
require('gozy').Model(this, 'MyRedis', {
	type: 'HASH',
	defaults: {
		Name: { type: 'STRING' }
		Value: { type: 'INTEGER' }
	}
});

this.on('initialize', function (model) {
});

exports.createNew = function (cb) {
	var model = exports.MyHashModel({ 
		Name: 'value1', 
		Value: 11
	});
	
	model.key('this_is_the_key');
	/* will store on redis as a key, "MyHashModel.this_is_the_key" */
	model.hmset(function (err) {
		if(err) return cb(err);
		
		console.log(model);
		return cb(null, model);
	});
};

exports.findModel = function (key, cb) {
	exports.hgetall(key, cb);
};

'''
#### Mailer Usage
```
require('gozy').Mailer(this, 'MyMailer', {
	template: 'application/server/mailer/templates/MailTemplate.html', /* used for underscore's template function */
	from: 'sender@mail.me'
});

this.on('initialize', function () {
});

this.on('mail', function (body, template_params, send) {
	console.log(body, template_params);
	send(template_params.ReceiverMail, template_params.SenderMail + ' welcomes you', body);
});
```

Template View Usage
===================
```
require('gozy').View(this, {
	template: {
		'ko-kr': 'application/view/templates/TemplateA.ko-kr.html',
		'en-us': 'application/view/templates/TemplateB.en-us.html'
	},
	default_template: 'ko-kr'
});

this.on('initialize', function () {
});
```

Content View Usage
===================
```
require('gozy').View(this, {
	content: content,
	mime: 'application/json'
});

function content(args) {
	return JSON.stringify(args);
}
```
License
=======
MIT License