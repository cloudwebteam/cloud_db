var mysql = require( 'mysql' );
var _ = require( 'underscore' );
var Table = require( './Table');
function CloudDb(){
	this._lastQuery = false;
	this._lastQueryArgs = false;
	this._connectionInfo = {}; 
	this._connection = false;
	this._tables = {};
}
CloudDb.prototype.addTable = function( tableSpec ){
	this._tables[ tableSpec.name ] = new Table( this, tableSpec ); 
	return this;
}; 
CloudDb.prototype.addTables = function( tables ){
	var that = this;
	_.each( tables, function( tableSpec ){
		this.addTable( tableSpec );
	});
	return this;
}; 
CloudDb.prototype.table = function( tableName ){
	if ( _.has( this._tables, tableName )){
		return this._tables[ tableName ];
	}
	console.log( 'Table "' + tableName+ '" has not been registered' )
	return false;
}
/* ==== CONNECTION FUNCTIONS ============================================= */
CloudDb.prototype.use = function( connection_info ){
	this._connectionInfo = connection_info; 	
	return this;
};
CloudDb.prototype.connect = function( connection_info, callback ){
	var that = this;

	if ( typeof(connection_info) === 'object' ){
		this.use( connection_info );
	} else if ( typeof(connection_info ) === 'function' ){
		callback = connection_info;
	}
	if ( this._connection ){
		this._connection.end();
	}
	// new connection
	this._connection = mysql.createConnection( this._connectionInfo );
	this._connection.connect( function(){
		callback( that ); 
	});
	return this; 
}
CloudDb.prototype.end = function(){
	this._connection.end();
}

/* ==== QUERY FUNCTIONS ============================================= */
CloudDb.prototype.query = function( query, callback ){
	this._lastQuery = query;

	this._connection.query( query, function( err, rows ){
		if( err ){
			console.log( err ); 
		}
		callback( rows ); 
	}); 
}

/* ==== CRUD ============================================= */

CloudDb.prototype.create = function( tableName, args, callback ){
	var table = this.table( tableName );
	if ( ! table ){
		return;
	}
	table.create.apply( table, Array.prototype.slice.call(arguments, 1) );
}
CloudDb.prototype.get = function( tableName, args, callback ){
	var table = this.table( tableName );
	if ( ! table ){
		return;
	}
	table.get.apply( table, Array.prototype.slice.call(arguments, 1) );
}
CloudDb.prototype.getOne = function( tableName, args, callback ){
	var table = this.table( tableName );
	if ( ! table ){
		return;
	}
	table.getOne.apply( table, Array.prototype.slice.call(arguments, 1) );
}
CloudDb.prototype.update = function( tableName, args, callback ){
	var table = this.table( tableName );
	if ( ! table ){
		return;
	}
	table.update.apply( table, Array.prototype.slice.call(arguments, 1) );
}
CloudDb.prototype.delete = function( tableName, args, callback ){
	var table = this.table( tableName );
	if ( ! table ){
		return;
	}
	table.delete.apply( table, Array.prototype.slice.call(arguments, 1) );
}

/* ==== enable INHERITANCE ============================================= */
// extend function from Backbone.js
var extend = function(protoProps, staticProps) {
	var parent = this;
	var child;

	// The constructor function for the new subclass is either defined by you
	// (the "constructor" property in your `extend` definition), or defaulted
	// by us to simply call the parent's constructor.
	if (protoProps && _.has(protoProps, 'constructor')) {
		child = protoProps.constructor;
	} else {
		child = function(){ return parent.apply(this, arguments); };
	}

	// Add static properties to the constructor function, if supplied.
	_.extend( child, parent, staticProps );

	// Set the prototype chain to inherit from `parent`, without calling
	// `parent`'s constructor function.
	var Surrogate = function(){ this.constructor = child; };
	Surrogate.prototype = parent.prototype;
	child.prototype = new Surrogate;

	// Add prototype properties (instance properties) to the subclass,
	// if supplied.
	if (protoProps) _.extend(child.prototype, protoProps);

	// Set a convenience property in case the parent's prototype is needed
	// later.
	child.__super__ = parent.prototype;

	return child;
};

// Set up inheritance
CloudDb.extend = extend;

module.exports = new CloudDb;