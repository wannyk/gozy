var cluster = require('cluster');
var nodemailer = require('nodemailer'),
	EventEmitter = require('events').EventEmitter,
	fs = require('fs'),
	_ = require('underscore');

function Mailer(name, options) {
	this.name = name;
	this.smtpTransport = nodemailer.createTransport('SMTP', options);
	
	if(cluster.isMaster) global.gozy.info('Mailer "' + this.name + '" is configured');	
}

var TEMPLATE = 'template', FROM = 'from';

var mailer_settings = {}, mailer_pool = {};

exports.Mailer = function (obj, mailer_name, opt) {
	/* Called by individual mailer scripts as 'require('gozy').Mailer~' */
	_.extend(obj, new EventEmitter());
	obj._opt = opt;
	if(!mailer_pool[mailer_name]) mailer_pool[mailer_name] = [];
	mailer_pool[mailer_name].push(obj);
};

exports.bindMailer = function (mailer_name, options) {
	mailer_settings[mailer_name] = new Mailer(mailer_name, options);
	return this;
};

exports.initializeAll = function () {
	for(var mailer_name in mailer_settings) {
		var mailer = mailer_settings[mailer_name];
		
		if(!mailer_pool[mailer_name])
			if(cluster.isMaster) global.gozy.warn('Mailer "' + mailer_name + '" does not have any instance');
		else {
			for(var i=0; i<mailer_pool[mailer_name].length; i++) 
				mailer.attach(mailer_pool[mailer_name][i]);
			if(cluster.isMaster) global.gozy.info('Mailer "' + mailer_name + '" initiates ' + mailer_pool[mailer_name].length + ' instances');
		}
	}
};

Mailer.prototype.attach = function (obj) {
	var options = obj._opt;
	if(!options || !options[TEMPLATE])
		if(cluster.isMaster) return global.gozy.error('An instance of mailer "' + this.name + '" does not specify a template');
	if(!fs.existsSync(options[TEMPLATE]))
		if(cluster.isMaster) return global.gozy.error('Mail template "' + fs.realpathSync(options[TEMPLATE]) + '" is not found');
	if(!options[FROM])
		if(cluster.isMaster) return global.gozy.error('An instance of mailer "' + this.name + '" does not specify a sender');
		
	var template = fs.readFileSync(options[TEMPLATE]).toString(),
		from = options[FROM];
	
	obj.send = this.generateSendMailFunc(from, template);	
	obj.emit('initialize');
};

Mailer.prototype.generateSendMailFunc = function (from, template) {
	var smtpTransport = this.smtpTransport;
	return function (template_obj, cb) {
		if(!template_obj) template_obj = {};
		var body = _.template(template, template_obj);
		
		this.emit('mail', body, template_obj, function (to, subject, body) {
			if(!to) return global.gozy.error('Mailer: receiver email is not specified. sending failed.');
			if(!subject) {
				global.gozy.error('Mailer: subject is not specified.');
				subject = 'untitled';
			}
				
			var options = {
				from: from,
				to: to,
				subject: subject,
				html: body
			};
			
			smtpTransport.sendMail(options, cb);
		});
	};
};