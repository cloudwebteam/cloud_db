var _ = require( 'underscore' );
var validator = require( './validator' );
var TableSync = require( './TableSync' );
var noop = function(){}; // do nothing.
var Table = function( db, tableSpec ){
	this._db = db; 
	this._log = [];
	this._validator = validator; 
	this.logging = true;

	_.extend( this.spec, tableSpec );
	this.spec._columns = this.getColumns();
	this.name = this.spec.name;
	if ( ! this.name ){
		this.log( 'You must, at a minumum, provide a table name' );
	}
}
Table.prototype.spec = {
	name: '',
	views: {
		detail: true,
		list: true,
		add: true,
		edit: true,
	},	
	columns: {},
	_columns: {}
}
Table.prototype.formattedSpec = {}
Table.prototype.getColumns = function( columnsToReturn ){
	if ( _.isArray( columnsToReturn ) && columnsToReturn.length > 0 ){
		var filtered = [];
		for( var i = 0; i < columnsToReturn.length; i++ ){
			filtered[ columnsToReturn[i] ] = this.spec.columns[ columnsToReturn[i] ] ;
		}

		return this._formatColumnSpecs( filtered ) ; 
	} else {
		return this._formatColumnSpecs( this.spec.columns );
	}
}	
Table.prototype._formatColumnSpecs = function( columnsSpec ){
	return _.toArray( _.map( columnsSpec, function( colSpec, colName ){
		if ( ! colSpec.hasOwnProperty( 'db' ) ){
			colSpec.db = {};
		}		
		colSpec.db = _.extend({ 
			type: 'varchar(200)',
			'default': null,
			'null': true,
			unique: false,
			foreign: false
		}, colSpec.db );

		if ( colSpec.hasOwnProperty( 'db_type' ) ){
			colSpec.db.type = colSpec.db_type;
			delete colSpec.db_type; 
		}
		colSpec.name = colName; 
		return colSpec;
	})); 	

}	
/* ==== QUERY and query sanitization ============================================= */
Table.prototype.query = function( query, next ){
	return this._db.query( query, next );
}
Table.prototype._prepareArgs = function( args ){
	if ( _.isNumber( args )){
		return args;
	}
	var toUpperCase = [ 'select', 'join', 'limit', 'offset', 'order', 'orderby', 'groupby' ]
	var results = {}
	for( key in args ){
		if ( toUpperCase.indexOf( key ) !== -1 ){
			results[ key.toUpperCase() ] =  args[key];
		} else {
			results[ key ] = args[key]; 
		}		
	}
	return results;
}
Table.prototype.validate = function( toSave ){
	var validation = this._validator.checkAgainstTable( toSave, this.getColumns() );
	
	if ( validation.passed ){
		return validation.toSave ; 
	} else {
		this.log( validation.errors ); 
		return false;
	}
}
Table.prototype.sync = function( cb ){
	var syncSpec = {
		name: this.spec.name, 
		columns: this.getColumns(),
		indexes: this.spec.indexes,		
		constraints: this.spec.constraints
	}
	TableSync.sync( this._db, syncSpec, cb );
}	
Table.prototype.checkSync = function( cb  ){
	var syncSpec = {
		name: this.spec.name, 
		columns: this.getColumns(),
		indexes: this.spec.indexes,
		constraints: this.spec.constraints
	}	
	TableSync.checkSync( this._db, syncSpec, cb ); 
}	
Table.prototype.addValidationType = function( type, validationFnct, defaultError ){
	this._validator.addType( type, validationFnct, defaultError );
}
Table.prototype.onSaveValidationType = function( validationType, fnct  ){
	this._validator.validator.onSave( validationType, fnct );
}

/* ==== CREATE ============================================= */
Table.prototype.create = function( args, next ){
	if ( ! args ){
		this.log( 'You must provide an object to '+ this.name + '.create()' ); 
		return;
	}
	next = next || noop;

	args = this.validate( args );
	if ( ! args ){
		this.log( 'The values did not pass the validation requirements, so nothing was created', 'Notice' )
		return; 
	}

	var col_names = [];
	var col_values = []; 
	_.each( args, function( col_value, col_name ){
		col_names.push( '`' + col_name + '`' ); 
		if ( col_value !== 0 && ! col_value ){
		 	col_values.push( 'NULL' );
		} else {
			col_values.push( '\'' + col_value  + '\'' ); 
		}		
	});
	var query =  'INSERT INTO `'+ this.name + '` ';
	
	query += '(' + col_names.join( ', ' ) + ') '; 		
	query += 'VALUES ';
	query += '(' + col_values.join( ', ' ) + ')';
	var that = this;
	this._db.query( query, function( result ){
		if( result ){
			that.get( result.insertId, function( dbObject ){
				next( dbObject );
			});
		} else { 
			that.log( 'Failed to insert row. Check MySQL error (probably related to foreign keys or unique indexes.)');
			next( false ); 
		} 
	}); 
}

/* ==== GET ============================================= */
Table.prototype.get = function( args, next ){	
	if ( ! args ){
		args = {}; 
	} else if ( _.isFunction( args ) ){
		next = args;
		args = {};
	} else if ( _.isArray( args )){
		// array of IDs for args
		args = { 
			ID: args
		}
	}
	next = next || noop;

	args = this._prepareArgs( args );	
	var query = this._getQuerySelect( args );
	query += this._getQueryWhere( args ); 
	query += this._getQueryJoin( args );
	query += this._getQueryOrder( args ); 	
	this.query( query, function( results ){
		if ( ! results ){
			next( false );
			return;
		}
		if ( _.isNumber( args ) ){
			if ( results.length > 0 ){
				next( results[0] );
				return;
			}
		}
		next( results );
	}); 
	
}
Table.prototype.getOne = function( args, next ){	
	if ( ! args ) args = {}; 	
	if ( _.isFunction( args ) ){
		next = args; 
		args = {};
	}

	next = next || noop;

	args.LIMIT = 1; 
	this.get( args, function( results ){
		if ( results.length > 0 ){
			next( results[0] );
			return;
		}
		next( false );
	});
}
/* ---- query builder functions -------------------------------------- */
Table.prototype._getQuerySelect = function( args ){
	var query_select = '*';
	if ( args.hasOwnProperty( 'SELECT' )){
		if ( _.isString( args.SELECT )){
			query_select = args.SELECT; 
		} else if ( args.SELECT.length !== undefined  ){
			var select_terms = _.map( args.SELECT, function( term ){
				if ( _.isString( term ) ) return '`' + term + '`'; 

				if ( _.has( term, 'column' ) && _.has( term, 'as' ) ){
					return  '`' + term.column + '` AS `' + term.as + '`'; 
				} else {
					console.log( 'NOTE: one of your select arguments is malformed.', term );
				}
			}); 
			query_select = select_terms.join( ', ' );
		} else if ( _.isObject( args.SELECT)){
			var all_select_terms = [];
			_.each( args.SELECT, function( tableSelect, tableName ){
				var table_select_terms = [];
				if ( _.isString( tableSelect ) ) table_select_terms.push( '`'+ tableName + '`.`' + tableSelect + '`' ); 

				if ( _.isArray( tableSelect ) ){
					var select_terms = _.map( tableSelect, function( col ){

						if ( _.isString( col ) ) return '`'+ tableName + '`.`' + col + '`'; 

						if ( _.has( col, 'column' ) && _.has( col, 'as' ) ){
							return '`'+ tableName + '`.`' + col.column + '` AS `' + col.as + '`'; 
						} else {
							console.log( 'NOTE: one of your select arguments is malformed.', col );
						}
					}); 
					table_select_terms = table_select_terms.concat( select_terms );
				} else if ( _.isObject( tableSelect ) ){					
					if ( _.has( tableSelect, 'column' ) && _.has( tableSelect, 'as' ) ){

						table_select_terms.push(  '`'+ tableName + '`.`' + tableSelect.column + '` AS `' + tableSelect.as + '`' ); 
					} else {
						console.log( 'NOTE: one of your tables\' select arguments is malformed.', tableSelect );
					}
				}
				all_select_terms = all_select_terms.concat( table_select_terms ); 
			});
			query_select = all_select_terms.join( ', ' );			
		}
	}
	if ( query_select ){
		return 'SELECT ' + query_select + ' FROM `' + this.name + '`' + "\r\n"; 
	}
	return '';
};
Table.prototype._getQueryWhere = function( args ){
	var query_where = ''; 
	// its an ID that's been passed in		
	if ( _.isNumber( args ) ) {
		query_where += ' WHERE ID = ' + args;
		return query_where;
	}
	var select_terms = [];
	var that = this;
	_.each( args, function( col_value, col_name ){
		var select_term = ''; 
		switch( col_name ){
			// ignore these guys
			case 'SELECT' :
			case 'LIMIT' : 
			case 'OFFSET' : 
			case 'ORDER' : 
			case 'ORDERBY' : 
			case 'GROUPBY' : 
			case 'JOIN' :
				return;
				break;
			default:
				if ( _.isArray( col_value ) ){
					select_term = '`' + col_name  + '` IN ( \'' + col_value.join('\', \'') +'\' )';			
				} else if ( _.isObject( col_value ) ){
					// the only business an object has being here is to request...
					//... a subquery!
					var table = false;
					var colData = _.findWhere( that.spec._columns, { name: col_name }); 
					if ( colData && colData.db.hasOwnProperty('foreign') ){
						var colForeignKey = colData.db.foreign; 
					}
					if ( colForeignKey ){
						select_term = '`' + col_name  + '` IN ( \n';
						select_term += 'SELECT ' + colForeignKey.column + ' FROM ' + colForeignKey.table ;
						select_term += that._getQueryWhere( col_value ); 
						select_term += ' )'; 
					} else {
						that.log( 'You have a sub query that does not specify a table', 'notice' );
					}
				} else if ( col_value || col_value === 0 ) {
					select_term = '`' + col_name + '` = "' + col_value + '"'; 
				// if set to empty string, false, or null
				} else {
					select_term = '`' + col_name + '` = "' + col_value + '" OR `' + col_name + '` IS NULL' ;
				}
		}
		select_terms.push( select_term ); 

	});
	if ( select_terms.length > 0 ){
		query_where += ' WHERE ';
		query_where += select_terms.join( ' AND ' );
	}
	if ( query_where ){
		return query_where  + "\r\n"; 
	}
	return '';
	
}
Table.prototype._getQueryJoin = function( args ){
	if ( ! _.has( args, 'JOIN' )) return;

	var joinStatement = '';
	var joinType = _.has( args.JOIN, 'type' ) ? args.JOIN.type.toUpperCase() : 'INNER'; 
	// references a column with a foreign key
	if ( _.isString( args.JOIN ) ){
		var columnName = args.JOIN; 
		var colData = _.findWhere( this.spec._columns, { name: columnName }); 
		if ( colData && colData.db.hasOwnProperty('foreign') ){
			var colForeignKey = colData.db.foreign; 
			if ( colForeignKey ){
				joinStatement += joinType + ' JOIN `' + colForeignKey.table + '` on `' + colForeignKey.table + '`.`' + colForeignKey.column + '` = `' + this.spec.name + '`.`' + columnName + '`'; 
			} else {
				this.log( 'JOIN references column ' + columnName + ' that does not have a foreign key', 'notice' );
			}
		} else {
			this.log( 'JOIN references column \'' + columnName + '\' that does not exist', 'notice' );
		}
	} else {
		if ( ! _.isObject( args.JOIN ) || ! ( _.has( args.JOIN, 'column' ) && _.has( args.JOIN, 'on' ) )){
			this.log( 'JOIN argument is invalid. Need to be\n 1) a string referencing column name with a foreign key. \n 2) an object with at least \'column\' and \'on\' properties.', 'notice');
			return;
		}
		var colData = _.findWhere( this.spec._columns, { name: args.JOIN.column }); 
		if ( ! colData ){
			this.log( 'JOIN argument column: \'' + args.JOIN.column +'\' does not exist in the spec.', 'notice' )
			return;
		}
		if ( ! ( _.has( args.JOIN.on, 'table') && _.has( args.JOIN.on, 'column' ) ) ){
			this.log( 'JOIN argument on must have properties \'table\' and \'column\'', 'notice' );
			return;
		}
		var operator = _.has( args.JOIN, 'operator' ) ? args.JOIN.operator : '=';
		joinStatement += joinType + ' JOIN `' + args.JOIN.on.table + '` on `' + args.JOIN.on.table + '`.`' + args.JOIN.on.column + '` ' + operator + ' `' + this.spec.name + '`.`' + args.JOIN.column + '`'; 
	}
	return joinStatement; 
}
Table.prototype._getQueryOrder = function( args ){
	var query_order = '' ; 
	if ( _.isObject( args ) ){
		var groupby = args.hasOwnProperty( 'GROUPBY' ) ? args.GROUPBY : '';
		if ( groupby ){			
			query_order += ' GROUP BY `' + groupby  + '`'; 
		}		
		var orderby = args.hasOwnProperty( 'ORDERBY' ) ? args.ORDERBY : '';
		var order = args.hasOwnProperty( 'ORDER' ) ? args.ORDER : '';
		if ( orderby || order ){
			query_order += ' ORDER BY `' + orderby + '` ' + order;
		}		
		var limit = args.hasOwnProperty( 'LIMIT' ) ? args.LIMIT : '';
		if ( limit ){
			query_order += ' LIMIT ' + limit;
		} 

		var offset = args.hasOwnProperty( 'OFFSET' ) ? args.OFFSET : '';
		if ( offset ){
			query_order += ' OFFSET ' + offset;
		}	
		
	}
	if ( query_order ){
		return query_order  + "\r\n"; 
	}
	return '';
};

/* ==== UPDATE ============================================= */
Table.prototype.update = function( args1, args2, next ){
	if ( _.isNumber( args1 ) ){
		var whereArgs = args1;
		var updateArgs = args2; 
		if ( ! _.isObject( updateArgs ) || _.isEmpty( updateArgs ) ){
			this.log( 'Provided an id, but no args to ' +this.name + '.update()', 'notice' );
			return;
		}
	} else if ( _.isObject( args1 ) ){
		// use args1 as setter
		if ( _.has( args1, 'id' )){
			var object = args1;
			var id = args1.id; 
			delete args1.id;
			var whereArgs = id;
			var updateArgs = object; 
			if ( _.isEmpty( updateArgs )){
				this.log( this.name + '.update() needs an object with more than just id to execute an update.');
				return;
			}
			// shift callback to second argument
			var next = args2; 
		// use args1 to get all rows that match, and then use args2 to update the rows.
		} else {
			if ( ! _.isObject( args2 ) || _.isEmpty( args2 )){
				this.log( this.name + '.update() should have an object with properties to set as the second argument.' );
				return;
			}
			var whereArgs = args1; 
			var updateArgs = args2; 
		}
	} else {
		this.log( 'Please check the arguments provided for ' + this.name + '.update()', 'notice' );
		return;
	}

	next = next || noop;
	
	updateArgs = this.validate( updateArgs );
	if ( ! updateArgs ){
		this.log( 'The values did not pass the validation requirements, and weren\'t saved', 'Notice' )
		return; 
	}
	var select_terms = []; 
	_.each( updateArgs, function( col_value, col_name ){
		if( _.isString( col_value) ){
			col_value = '\'' + col_value + '\'';
		} else if ( _.isNull( col_value ) ){
			col_value = 'NULL';
		}
		select_terms.push( '`' + col_name  + '` = ' + col_value );
	});

	var query = 'UPDATE `' + this.name + '` SET '+ "\r\n";
	query += select_terms.join( ', ' ) + ' ' + "\r\n";
	query += this._getQueryWhere( whereArgs );
	var that = this;
	this.query( query, function( results ){
		if ( ! results ){
			this.log( this.name + '.update() failed for some reason' );
			next( false ); 
			return;
		} else if ( results.affectedRows ){
			that.get( whereArgs, function( updatedObject ){
				next( updatedObject );
			});
		}
	});
};
Table.prototype.delete  = function( to_delete, next ){
	if ( ! to_delete ){
		this.log( this.name + '.delete() needs an object or an id specified' );
		return;
	}

	next = next || noop;

	// DbObject given.
	if ( _.isObject( to_delete ) ){
		if ( to_delete.hasOwnProperty( 'id') ){
			var whereArgs = to_delete.id;
		} else {
			var whereArgs = to_delete;
		}

	// ID given
	} else {
		var whereArgs = to_delete;
	}
	var query = 'DELETE FROM ' + this.name + "\r\n";			
	query += this._getQueryWhere( whereArgs );
	this.query( query, function( results ){
		if ( results.affectedRows ){
			next( true );
		}
		next( false );
	});
}


/* ==== HANDLING errors ============================================= */
Table.prototype.log = function( message, type ){
	if ( this.logging ){
		if ( type ) message = type.toUpperCase() + ': '+ message;
		console.log( message );
	}
	this._log.push( message );
}
module.exports = Table; 