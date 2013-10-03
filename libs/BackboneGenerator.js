var _ = require('underscore');

var /* GLOBAL CONSTANTS */
	TYPE = 'Type', BACKBONE_MODEL = 'model', BACKBONE_COLLECTION = 'collection',
	ACCEPT_URL = 'AcceptUrl',
	/* CONSTANTS FOR MODEL */
	MODEL_OPTIONS = 'ModelOptions',
	/* CONSTANTS FOR COLLECTION */ 
	MODEL_URL = 'ModelUrl', COLLECTION_OPTIONS = 'CollectionOptions';

/* COLLECTION TEMPLATE */	 
var RequireJSCollectionPrefix = [
	'define([',
    '	\'jquery\',',
	'	\'underscore\',',
	'	\'backbone\'',
	'<% if(model_url) { %>',
	'	\'<%=model_url%>\'',
	'], function($, _, Backbone, Model) {',
	'<% } else { %>',
	'], function($, _, Backbone) {',
	'<% } %>',
].join('\n');

var BackboneCollectionTemplate = [
	'	var Model = Backbone.Model.extend({',
	'<% if(ModelOptions) { %>',
	'		<%=ModelOptions%>',
	'<% } %>',
  	'	});',
	'	var Collection = Backbone.Collection.extend({',
	'		url: \'<%=url%>\',',
	'		model: Model,',
	'		<%=CollectionOptions%>',
  	'	});'
].join('\n');

var RequireJSCollectionSuffix = [
	'',
	'	return Collection;',
	'});'
].join('\n');

/* MODEL TEMPLATE */
var RequireJSModelPrefix = [
	'define([',
    '	\'jquery\',',
	'	\'underscore\',',
	'	\'backbone\'',
	'], function($, _, Backbone) {',
	'',
].join('\n');

var BackboneModelTemplate = [
	'	var Model = Backbone.Model.extend({',
	'		url: \'<%=url%>\',',
	'		<%=ModelOptions%>',
  	'	});'
].join('\n');

var RequireJSModelSuffix = [
	'',
	'	return Model;',
	'});'
].join('\n');

exports.generateModelContentFunction = function (accept_url, accept_method, options) {
	if(options[TYPE] !== BACKBONE_MODEL) throw new Error('Integrity check failed: is not a model');
	
	if(accept_url instanceof RegExp) accept_url = regexp2string(accept_url);
	if(typeof options[ACCEPT_URL] == 'string') accept_url = options[ACCEPT_URL];
	
	global.gozy.silly('Backbone Model generation for ' + accept_method + ' ' + accept_url);
	console.log(options);
	
	var ModelOptions = options[MODEL_OPTIONS];
	if(ModelOptions) {
		ModelOptions = JSON.stringify(options.ModelOptions);
		ModelOptions = ModelOptions.substring(1, ModelOptions.length - 1);
	} else ModelOptions = '';
	
	
	var GeneratedTemplate = _.template(BackboneModelTemplate, {
		url: accept_url,
		ModelOptions: ModelOptions
	});
	
	if(options.RequireJS) 
		GeneratedTemplate = RequireJSModelPrefix + GeneratedTemplate + RequireJSModelSuffix;
	
	global.gozy.silly('Backbone Model has been generated:\n' + GeneratedTemplate);
	
	GeneratedTemplate = new Buffer(GeneratedTemplate);
	return function () {
		return GeneratedTemplate;
	};
};

exports.generateCollectionContentFunction = function (accept_url, accept_method, options) {
	if(options[TYPE] !== BACKBONE_COLLECTION) throw new Error('Integrity check failed: is not a collection');
	 
	if(accept_url instanceof RegExp) accept_url = regexp2string(accept_url);
	if(typeof options[ACCEPT_URL] == 'string') accept_url = options[ACCEPT_URL];
	
	global.gozy.silly('Backbone Collection generation for ' + accept_method + ' ' + accept_url);
	console.log(options);
	
	var CollectionOptions = options[COLLECTION_OPTIONS];
	if(CollectionOptions) {
		CollectionOptions = JSON.stringify(options.CollectionOptions);
		CollectionOptions = CollectionOptions.substring(1, CollectionOptions.length - 1);
	} else CollectionOptions = '';
	
	var ModelOptions = options[MODEL_OPTIONS];
	if(ModelOptions) {
		ModelOptions = JSON.stringify(options.ModelOptions);
		ModelOptions = ModelOptions.substring(1, ModelOptions.length - 1);
	} else ModelOptions = '';
	
	var GeneratedRequireJSCollectionPrefix = _.template(RequireJSCollectionPrefix, {
		model_url: options[MODEL_URL]
	});
	
	var GeneratedTemplated = _.template(BackboneCollectionTemplate, {
		url: accept_url,
		ModelOptions: ModelOptions,
		CollectionOptions: CollectionOptions
	});
	
	if(options.RequireJS) 
		GeneratedTemplated = GeneratedRequireJSCollectionPrefix + GeneratedTemplated + RequireJSCollectionSuffix;
		
	global.gozy.silly('Backbone Collection has been generated:\n' + GeneratedTemplated);
	
	GeneratedTemplated = new Buffer(GeneratedTemplated);
	return function () {
		return GeneratedTemplated;
	};
};

function regexp2string(regex) {
	var string = regex.toString();
	string = string.replace(/\[[A-z0-9\-]*\]/g, '');
	string = string.replace(/{[A-z0-9,]*}/g, '');
	string = string.replace(/[^A-z0-9\/]/g, '').replace(/[\^\\]/g, '');
	if(string.charAt(0) == '/' && string.charAt(string.length - 1) == '/')
		string = string.substring(1, string.length - 1);
	return string;
}