var _ = require( 'underscore' ); 
var noop = function(){}; // do nothing.

function TableSync( db, tableSpec, cb ){
	cb = cb || noop;

	this.db = db;
	this.spec = {
		name: '', 
		columns: {}, 
		indexes: {},
		constraints: {}
	}
	_.extend( this.spec, tableSpec );

	/* ==== prepare & check the format of the spec ============================================= */
	if ( !this.spec.name ){
		console.log( 'SYNC: table has no name' );
		return cb( false );
	}
	if ( this.spec.columns.length === 0 ){
		console.log( 'SYNC: table has no columns specified' );
		return cb( false );
	}

	var that = this;
	/* ==== API ============================================= */
	this.check = function( cb ){
		cb = cb || noop;

		var that = this;
		this.checkForTable( this.spec.name, function( tableExists ){
			// if the table doesn't exist, then stop everything and create it according to spec
			if ( ! tableExists ){			
				return cb({
					table: false,
					columns: false,
					indexes: false,
					constraints: false
				})
			}			
			that.checkColumns( function( columnsStatus ){
				that.checkIndexes( function( indexesStatus ){
					return cb({
						table: true,
						columns: columnsStatus,
						indexes: indexesStatus,
						constraints: false
					})					
				});
			}); 
		});
	}
	this.sync = function( cb ){
		cb = cb || noop;

		var that = this;
		var colNames = _.pluck( this.spec.columns, 'name' );
		this.check( function( status ){
			console.log( status );
			// create missing table
			if ( ! status.table ){
				that.createTable( function(){
					// we assume that all columns are in sync, because we created it from the spec
				});
			} else if ( status.columns !== true ) {
				// CREATE added columns
				if ( status.columns.added.length > 0 ){
					_.each( status.columns.added, function( colName ){
						var colPosition = colNames.indexOf( colName ); 
						var afterWhichCol = colPosition === 0 ? 'ID' : colNames[ colPosition - 1 ];
						var colSpec = _.findWhere( that.spec.columns, { name: colName });
						var query = 'ALTER TABLE `' + that.spec.name + '`';
						query += ' ADD `' + colName + '` ' + colSpec.db.type; 
						query += ' AFTER `' + afterWhichCol + '`' ;
						
						db.query( query, function( result ){
							if ( result ){
								console.log( 'SYNC: Added column \'' + colName + '\' to table \'' + that.spec.name + '\'' );
							}
						});
					});
				}
				// DELETE removed columns ( if empty )
				if ( status.columns.removed.length > 0 ){
					_.each( status.columns.removed, function( colName ){
						// check if its empty
						var query = 'SELECT * FROM `' + that.spec.name + '`' ;
						query += " WHERE `" + colName + "` IS NOT NULL" ; 
						that.db.query( query, function( result ){
							if ( result.length > 0 ){
								console.log( 'SYNC: \'' + that.spec.name + '.' + colName + '\' is no longer needed, but was not deleted because it has data.')
								return false; 
							}

							query = 'ALTER TABLE `' + that.spec.name + '` DROP ' + colName; 
							that.db.query( query, function( result ){
								if ( result ){
									console.log( 'SYNC: Removed \'' + that.spec.name + '.' + colName + '\'' );
								}
							}); 

						});
					}); 

				}

				// RENAME renamed columns 
				if ( status.columns.renamed.length > 0 ){
					_.each( status.columns.renamed, function( renamedCol ){
						var colSpec = _.findWhere( that.spec.columns, { name: renamedCol.to });						
						var nullValue =  colSpec.db['null'] ? ' null' : ' not null';
						var defaultValue = colSpec.db['default'] ? ' DEFAULT ' + colSpec.db['default'] : '';

						var query = 'ALTER TABLE `' + that.spec.name + '`';
						query += ' CHANGE `' + renamedCol.from + '`';
						query += ' `' + renamedCol.to + '`';
						query += ' ' + colSpec.db.type;
						query += nullValue;
						query += defaultValue;	

						that.db.query( query, function( result ){
							if ( result ){
								console.log( 'Renamed column \'' + that.spec.name + '.' + renamedCol.from + '\' to \'' + that.spec.name + '.' + renamedCol.to + '\'' );
							}
						} );
					});			
				}				
				// CHANGED altered columns
				if ( status.columns.changed.length > 0 ){
					_.each( status.columns.changed, function( colName ){
						var colSpec = that.spec.columns[ colName ];
						var nullValue =  colSpec.db['null'] ? ' null' : ' not null';
						var defaultValue = colSpec.db['default'] ? ' DEFAULT ' + colSpec.db['default'] : '';

						var query = 'ALTER TABLE `' + that.spec.name + '`';
						query += ' MODIFY COLUMN `' + colName + '`';
						query += ' ' + colSpec.db.type;
						query += nullValue;
						query += defaultValue;	

						that.db.query( query, function( result ){
							if ( result ){
								console.log( 'Updated column \'' + that.spec.name + '.' + colName + '\' because it had changed.' );
							}
						} )
					});
					
				}				
				
			}
			if ( status.indexes ){
				_.each( status.indexes.added, function( indexKey ){
					var index = _.findWhere( that.spec.indexes, { name: indexKey });
					var query = 'ALTER TABLE `' + that.spec.name + '`'; 
					query += index.hasOwnProperty( 'unique' ) && ! index.unique ? ' ADD ' : ' ADD UNIQUE ';
					query += ' INDEX `' +indexKey+'` ( `' + index.column + '` )';
					that.db.query( query, function( results ){
						console.log( 'SYNC: Added index \'' + indexKey + '\' to \`' + that.spec.name + '.' + index.column + '\' because it had changed.' );
					});
				});				
				_.each( status.indexes.removed, function( indexKey ){
					var query = 'ALTER TABLE `' + that.spec.name + '`';
					query += " DROP INDEX `" + indexKey + "`" ; 
					that.db.query( query, function( results ){
						console.log( 'SYNC: Dropped index \'' + indexKey + '\' from table \'' + that.spec.name + '\' because it was no longer in the spec.' );
					});
				}); 
				_.each( status.indexes.changed, function( indexKey ){
					var query = 'ALTER TABLE `' + that.spec.name + '`';
					query += " DROP INDEX `" + indexKey + "`" ; 
					that.db.query( query, function( results ){
						var index = _.findWhere( that.spec.indexes, { name: indexKey });
						var query = 'ALTER TABLE `' + that.spec.name + '`'; 
						query += index.hasOwnProperty( 'unique' ) && ! index.unique ? ' ADD ' : ' ADD UNIQUE ';
						query += ' INDEX `' +indexKey+'` ( `' + index.column + '` )';
						that.db.query( query, function( results ){
							console.log( 'SYNC: updated index \'' + indexKey + '\' on table \'' + that.spec.name + '\'' );
						});
					});
				}); 		
			}
			var all_good = true;
			if ( status.table !== true 
				|| status.columns !== true 
				|| status.indexes !== true
			){
				console.log( status );
				cb( 'SYNCING...', 'Everything looks good' );
			} else {
				cb( 'SYNCING...', 'Changes needed', status );
			}
		});
	}
}
TableSync.prototype.checkForTable = function( tableName, next ){
	this.db.query( "SHOW TABLES LIKE '" + tableName + "'", function( result ){		
		var tableExists = result && result.length > 0; 
		next( tableExists ); 
	});	
}	
TableSync.prototype.createTable = function( cb ){
	console.log( 'created table' + this.spec.name + ' because it did not exist.');	
	this.db.query( getTableQuery( this.spec ), cb ); 
}
TableSync.prototype.checkColumns = function( cb ){
	var that = this; 
	// get current columns data from DB
	var dbColumns = [];
	that.db.query( 'SHOW FIELDS FROM `' + that.spec.name + '`', function( results ){
		var dbColData = results;		
		// arrange columns from DB into agreeable format
		_.each( dbColData, function( dbColumn, index ){
			if( dbColumn.Field === 'ID' ) return;

			dbColumns.push({
				index: index,
				name: dbColumn.Field,
				type: dbColumn.Type,
				'null': dbColumn.Null,
				'default': dbColumn.Default
			});
		});

		// go through columns in spec and compare to DB
		var columnsToRemove = [];
		var columnsToAdd = [];
		var columnsToRename = [];					
		var columnsToChange = [];

		// check if there are extra columns in DB that are not in spec -
		columnsToRemove = _.filter( dbColumns, function( value ){
			return ! _.findWhere( that.spec.columns, { name : value.name });
		});

		_.each( that.spec.columns, function( colSpec ){
			var dbColumn = _.findWhere( dbColumns, { name: colSpec.name });
			
			// column doesn't exist
			if ( ! dbColumn ){			
				columnsToAdd.push( colSpec ); // change format to easily compare with toRemove array
				return;
			}		
			var updateNeeded = false;		

			_.each( colSpec.db, function( value, key ){
				if ( value !== dbColumn[key] ){
					// change in NULL is a little nuanced
					if ( key  === 'null' ){
						if ( value && dbColumn[key].toLowerCase() !== 'yes' ){
							updateNeeded = true;
						} else if( ! value && dbColumn[key].toLowerCase() !== 'no' ){
							updateNeeded = true;
						}
					// change in anything isn't, and a sync is required
					} else {
						if ( _.isNumber( value ) && value !== +dbColumn[key] ){
							updateNeeded = true;
						}
					}
				}						
			});
			if ( updateNeeded ){
				columnsToChange.push( colSpec.name );
			}

		});	
		// check for column renaming...
		if ( columnsToRemove.length > 0 && columnsToAdd.length > 0 ){
			columnsToRemove = _.map( columnsToRemove, function( dbColumn ){
				var index = dbColumns
				var colBefore = index - 1 > 0 ? dbColumns[ index -1 ].name : 'ID'; 
				var colAfter = dbColumns.length > ( index + 1 ) ? dbColumns[index+1].name : false;
				return {
					index: dbColumn.index,
					name: dbColumn.name,							
					type: dbColumn.type,
					before: colBefore,
					after: colAfter
				}
			}); 
			columnsToAdd = _.map( columnsToAdd, function( colSpec ){

				var colBefore = colSpec.index - 1 > 0 ? that.spec.columns[ colSpec.index -1 ].name : 'ID'; 
				var colAfter = that.spec.columns.length > ( colSpec.index + 1 ) ? that.spec.columns[ colSpec.index + 1 ].name : false;
				return {
					name: colSpec.name,							
					type: colSpec.db.type,
					before: colBefore,
					after: colAfter
				}
			});
			columnsToAdd = _.filter( columnsToAdd, function( colToAdd ){
				var renamed = false;
				columnsToRemove = _.filter( columnsToRemove, function( colToRemove ){
					if ( renamed ){
						return true;
					}
					if(
						colToAdd.after === colToRemove.after 
						&& colToAdd.before === colToRemove.before 
						&& colToAdd.type === colToRemove.type 
					){
						columnsToRename.push({
							from: colToRemove.name,
							to: colToAdd.name
						});
						renamed = true;
						return false; 
					}
					return true;
				});
				return ! renamed;
			});					
		}
		columnsToAdd = _.map( columnsToAdd, function( col ){
			return col.name; 
		});
		columnsToRemove = _.map( columnsToRemove, function( col ){
			return col.name; 
		});
		var columnsStatus = {};
		_.each({
			added: columnsToAdd,
			removed: columnsToRemove,
			renamed: columnsToRename,
			changed: columnsToChange,
		}, function( item, key ){
			if( item.length > 0 ){
				columnsStatus[ key ] = item;
			}
		});
		if ( _.isEmpty( columnsStatus ) ){
			return cb( true )
		} else {
			return cb( columnsStatus);
		}
		
		return cb({
			table: true,
			columns: {
				added: columnsToAdd,
				removed: columnsToRemove,
				renamed: columnsToRename,
				changed: columnsToChange,
			},
			constraints: false
		});

	} );	
}
TableSync.prototype.checkIndexes = function( cb ){
	if ( ! this.spec.indexes ){
		return;
	}
	var that = this;
	var query = 'SHOW INDEXES IN ' + this.spec.name ; 

	var defaultIndex = {
		Non_unique: 0,
		Key_name: false,
		Column_name: false
	}
	// reformat for easy comparison
	var tableIndexes = _.map( this.spec.indexes, function( index ){
		var formatted = _.clone( defaultIndex ); 
		formatted.Non_unique = index.hasOwnProperty('unique') && ! index.unique ? 1 : 0;
		formatted.Key_name = index.name;
		formatted.Column_name = index.column;
		return formatted;
	}); 
	// compare with indexes currently in DB
	this.db.query( query, function( results ){
		// remove the primary index (since that is assumed and unchangeable in Cloud_DB)
		var dbIndexes = _.reject( results, function( dbIndex ){
			return dbIndex.Key_name === 'PRIMARY' && dbIndex.Column_name === 'ID';  
		});
		// filter all the indexes in the spec down to the ones that aren't in the db
		var notInDb = [];
		var differentFromDb = [];
		tableIndexes = _.each( tableIndexes, function( tableIndex ){
			// if it doesn't refer to an existing column
			if ( ! _.findWhere( that.spec.columns, { name: tableIndex.Column_name })){
				console.log( 'Attempting to add index \'' + tableIndex.Key_name + '\' to non-existent column \'' + that.spec.name + '.' + tableIndex.Column_name + '\'' );
			}
			var foundIndex = _.findWhere( dbIndexes, { Key_name: tableIndex.Key_name }); 
			if( foundIndex ){

				if ( ! _.isEqual( tableIndex, _.pick( foundIndex, 'Key_name', 'Column_name', 'Non_unique' ) ) ){
					console.log(tableIndex, _.pick( foundIndex, _.keys( tableIndex ) ) ); 
					differentFromDb.push( tableIndex );
				}	
				// remove the inspected item from dbIndexes
				dbIndexes = _.reject( dbIndexes, function( dbIndex ){
					return dbIndex.Key_name === tableIndex.Key_name 
				});					
				
			} else {
				notInDb.push( tableIndex );
			}
					
		});

		notInDb = _.map( notInDb, function( index ){
			return index.Key_name; 
		});
		dbIndexes = _.map( dbIndexes, function( index ){
			return index.Key_name; 
		});	
		differentFromDb = _.map( differentFromDb, function( index ){
			return index.Key_name; 
		});
		var indexesStatus = {};
		if ( notInDb.length > 0 ) indexesStatus.added = notInDb;
		if ( notInDb.length > 0 ) indexesStatus.removed = dbIndexes;
		if ( notInDb.length > 0 ) indexesStatus.changed = differentFromDb;

		if ( _.isEmpty( indexesStatus ) ){
			return cb( true )
		} else {
			return cb( indexesStatus);
		}		
	});

	// 	foreach( $index_types as $index_type => $indexes ){
	// 		foreach( $indexes as $index_name => $columns ){
	// 			$query = 'ALTER TABLE `'. $this->name .'`'; 
	// 			$columns_name = is_array( $columns ) ? '`'. implode( '`, `', $columns ) .'`': $columns ;  
	// 			if ( isset( $db_indexes[ $index_name ] ) ){
	// 				$old_columns_name = is_array( $db_indexes[ $index_name ] ) ? implode( ', ', $db_indexes[ $index_name ] ) : $db_indexes[ $index_name ] ;  
	// 				if ( $db_indexes[ $index_name ] !== $columns ){

	// 					$query .= " DROP INDEX `".$index_name . "`" ; 
	// 					$this->query( $query ); 
	// 					$this->error( 'DB: dropped index \''. $index_name . '\' from '. $old_columns_name , 'notice' ); 					
	// 					$query = 'ALTER TABLE `'. $this->name .'`' ; 								
	// 					$query .= ' ADD '. $index_type . ' INDEX `'.$index_name.'` ( '.$columns_name.' )' ; 
	// 					$this->query( $query ); 								
	// 					$this->error( 'DB: added index \''. $index_name . '\' to '. $columns_name , 'notice' ); 												
	// 				}
					
	// 			} else {
	// 				$query .= ' ADD '. $index_type . ' INDEX `'.$index_name .'` ( '.$columns_name.' )' ; 	
	// 				$this->query( $query ); 
	// 				$this->error( 'DB: added '. $index_type . ' INDEX \''.$index_name .'\' to '. $this->name . ' ('. $columns_name .')', 'notice' ); 												
										
	// 			}
	// 		}
	// 	}
	// }
}

function getTableQuery( tableSpec ){		
	var query = '';
	query += "CREATE TABLE `" + tableSpec.name + '`';
	var unique = tableSpec.unique ? 'UNIQUE ' : ''; 
	
	var columns = [];
	_.each( tableSpec.columns, function( col_spec, col_name ){
		columns.push( unique + ' `' + col_spec.name + '` ' + col_spec.db.type );
	});

	query += ' ( ';
	query += 'ID int NOT NULL AUTO_INCREMENT PRIMARY KEY, '; 
	query += columns.join( ', ' );
	query += ' )';
	query += ' ENGINE=InnoDB';
	return query;

}
var tableSyncer = ( function(){

	var checkSyncStatus = function( connection, tableSpec, cb ){
		return new TableSync( connection, tableSpec ).check( cb );
	}
	var executeTableSync = function( connection, tableSpec, cb ){
		return new TableSync( connection, tableSpec ).sync( cb ); 
	}
	return {
		checkSync: checkSyncStatus,
		sync: executeTableSync
	}
}() ); 

module.exports = tableSyncer; 	