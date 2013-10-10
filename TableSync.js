var _ = require( 'underscore' ); 
var noop = function(){}; // do nothing.

function TableSync( db, tableSpec, cb ){
	cb = cb || noop;

	this.db = db;
	this.spec = {
		name: '', 
		columns: {}
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
				// compile a list of unique indexes and foreign keys from columns
				that.foreignConstraints = {};
				that.uniqueConstraints = [];
				_.each( that.spec.columns, function( column ){
					if ( column.db.unique ){
						that.uniqueConstraints.push( column.name )
					}
					if ( column.db.foreign ){
						that.foreignConstraints[ column.name ] = column.db.foreign;
					}
				});
				that.checkUniqueConstraints( that.uniqueConstraints, function( uniqueConstraintsStatus ){
					that.checkForeignConstraints( that.foreignConstraints, function( foreignConstraintsStatus ){
						return cb({
							table: true,
							columns: columnsStatus,
							uniqueIndexes: uniqueConstraintsStatus,
							foreignKeys: foreignConstraintsStatus
						});
					});
				
				});
			}); 
		});
	}
	this.sync = function( cb ){
		cb = cb || noop;

		var that = this;
		var colNames = _.pluck( this.spec.columns, 'name' );
		this.check( function( status ){
			// create missing table
			if ( ! status.table ){
				that.createTable( function(){
					// we assume that all columns are in sync, because we created it from the spec
				});
			} else if ( status.columns !== true ) {
				// CREATE added columns
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
				// DELETE removed columns ( if empty )
				_.each( status.columns.removed, function( colName ){
					// check if its empty
					var query = 'SELECT * FROM `' + that.spec.name + '`' ;
					query += " WHERE `" + colName + "` <> \"\"" ; 
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

				// RENAME renamed columns 
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
							console.log( 'SYNC: Renamed column \'' + that.spec.name + '.' + renamedCol.from + '\' to \'' + that.spec.name + '.' + renamedCol.to + '\'' );
						}
					} );
				});			
				// CHANGED altered columns
				_.each( status.columns.changed, function( colName ){
					var colSpec = _.findWhere( that.spec.columns, {name: colName });
					var nullValue =  colSpec.db['null'] ? ' null' : ' not null';
					var defaultValue = colSpec.db['default'] ? ' DEFAULT ' + colSpec.db['default'] : '';

					var query = 'ALTER TABLE `' + that.spec.name + '`';
					query += ' MODIFY COLUMN `' + colName + '`';
					query += ' ' + colSpec.db.type;
					query += nullValue;
					query += defaultValue;	

					that.db.query( query, function( result ){
						if ( result ){
							console.log( 'SYNC: Updated column \'' + that.spec.name + '.' + colName + '\' because it had changed.' );
						}
					} )
				});
			}
			if ( status.uniqueIndexes ){
				_.each( status.uniqueIndexes.added, function( columnName ){
					var indexKey = 'unique_' + columnName;
					var query = 'ALTER TABLE `' + that.spec.name + '`'; 
					query += ' ADD UNIQUE INDEX `' +indexKey+'` ( `' + columnName + '` )';					
					that.db.query( query, function( results ){
						if ( results ){
							console.log( 'SYNC: Added unique index \'' + indexKey + '\' to \`' + that.spec.name + '.' + columnName + '\'.' );
						} else {
							console.log( 'SYNC: Could NOT add unique index \'' + indexKey + '\' to \`' + that.spec.name + '.' + columnName + '\'. Maybe you already have duplicates?' );
						}
					});
				});				
				_.each( status.uniqueIndexes.removed, function( columnName ){
					var indexKey = 'unique_' + columnName; 
					var query = 'ALTER TABLE `' + that.spec.name + '`';
					query += " DROP INDEX `" + indexKey + "`" ; 
					that.db.query( query, function( results ){
						if ( results ){
							console.log( 'SYNC: Dropped index \'' + indexKey + '\' from table \'' + that.spec.name + '\' because it was no longer in the spec.' );
						}
					});
				}); 
			}
			if ( status.foreignKeys ){
				_.each( status.foreignKeys.removed, function( reference, columnName ){
					var query = 'ALTER TABLE `' + that.spec.name + '`';

					if ( reference.fkName ){
						query += " DROP FOREIGN KEY `" + reference.fkName + "`" ;
						that.db.query( query, function( results ){
							console.log( 'SYNC: dropped foreign key \'' + reference.fkName + '\' on column \'' + columnName + '\', referencing  \'' + reference.table + '.' + reference.column + '\'' );
							var query = 'ALTER TABLE `' + that.spec.name + '`';
							query += " DROP INDEX `" + reference.indexName + "`" ; 
							that.db.query( query, function( results ){
								console.log( 'SYNC: dropped index \'' + reference.indexName + '\' on column \'' + columnName + '\'' );
							});
						});
					} else if ( reference.indexName ){
						query += " DROP INDEX `" + reference.indexName + "`" ; 
						that.db.query( query, function( results ){
							console.log( 'SYNC: dropped index \'' + reference.indexName + '\' on column \'' + columnName + '\'' );
						});						
					}
				}); 		
				_.each( status.foreignKeys.added, function( reference, columnName ){
					var query = 'ALTER TABLE `' + that.spec.name + '`'; 
					query += ' ADD CONSTRAINT FOREIGN KEY fk_' + that.spec.name + '_' + columnName;
					query += ' (`'+ columnName +'`)' ; 
					query += ' REFERENCES `cloud_db`.`' + reference.table + '` (`' + reference.column + '`)';
					that.db.query( query, function(results){
						if ( results ){
							console.log( 'SYNC: added foreign key fk_'+that.spec.name+'_'+columnName + ' to ' + that.spec.name + '.' + columnName + ', referencing \'' + reference.table + '.' + reference.column + '\'' );
						} else {
							console.log( 'SYNC: FAILED to add foreign key fk_'+that.spec.name+'_'+columnName + ' to ' + that.spec.name + '.' + columnName + '. \n 1)Check that the columns have the same type. \n 2)Check that the referenced column has a unique index on it.' );
						}
					});				
				});
				var addForeignKey = function( columnName, reference ){
					var query = 'ALTER TABLE `' + that.spec.name + '`'; 
					query += ' ADD FOREIGN KEY fk_' + that.spec.name + '_' + columnName;
					query += ' (`'+ columnName +'`)' ; 
					query += ' REFERENCES `cloud_db`.`' + reference.table + '` (`' + reference.column + '`)';
					that.db.query( query, function( results ){
						if ( results ){
							console.log( 'SYNC: updated foreign key fk_'+that.spec.name+'_'+columnName + ', now references \'' + reference.table + '.' + reference.column + '\'' );
						} else {
							console.log( 'SYNC: FAILED to update foreign key fk_'+that.spec.name+'_'+columnName + ' to ' + that.spec.name + '.' + columnName + '. \n 1)Check that the columns have the same type. \n 2)Check that the referenced column has a unique index on it.' );
						}
					});
				}
				_.each( status.foreignKeys.changed, function( reference, columnName ){

					// first, drop
					var query = 'ALTER TABLE `' + that.spec.name + '`';

					if ( reference.fkName ){
						query += " DROP FOREIGN KEY `" + reference.fkName + "`" ;
						that.db.query( query, function( results ){
							console.log( 'SYNC: dropped foreign key \'' + reference.fkName + '\' on column \'' + columnName + '\', referencing  \'' + reference.table + '.' + reference.column + '\'' );
							addForeignKey( columnName, reference ); 
						});
					} else {			
						addForeignKey( columnName, reference ); 
					}
				});
			}
			var all_good = true;
			_.each( status, function( checked ){
				if ( checked !== true ){
					all_good = false;
				}
			})
			if ( all_good ){
				cb( true );
			} else {
				cb( status );
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
		var idFound = false; 
		_.each( dbColData, function( dbColumn, index ){
			if( dbColumn.Field === 'ID' ){
				idFoundYet = true;
				return;
			}
			var index = idFoundYet ? index - 1 : index;
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

		_.each( that.spec.columns, function( colSpec, index ){
			var dbColumn = _.findWhere( dbColumns, { name: colSpec.name });
			// column doesn't exist
			if ( ! dbColumn ){	
				columnsToAdd.push({
					index: index, 
					name: colSpec.name,
					type: colSpec.db.type,
					'null': colSpec.db.null,
					'default': colSpec.db.default 
				});
				return;
			}		
			var updateNeeded = false;		
			_.each( colSpec.db, function( value, key ){
				if ( key === 'unique' || key === 'foreign'){
					return;
				}

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
						if ( _.isNumber( value ) ){
							if ( value !== +dbColumn[key] ){
								updateNeeded = true;
							}
						} else if ( value === true ){
							if ( dbColumn[key] !== 'YES' ){
								updateNeeded = true;
							}
						} else if ( value === false ){
							updateNeeded = true;
						} else {
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
				var colBefore = dbColumn.index > 0 ? dbColumns[ dbColumn.index -1 ].name : 'ID'; 
				var colAfter = dbColumns.length > ( dbColumn.index + 1 ) ? dbColumns[dbColumn.index+1].name : false;
				return {
					index: dbColumn.index,
					name: dbColumn.name,							
					type: dbColumn.type,
					before: colBefore,
					after: colAfter
				}
			}); 
			columnsToAdd = _.map( columnsToAdd, function( colToAdd ){
				var colBefore = colToAdd.index > 0 ? that.spec.columns[ colToAdd.index -1 ].name : 'ID'; 
				var colAfter = that.spec.columns.length > ( colToAdd.index + 1 ) ? that.spec.columns[ colToAdd.index + 1 ].name : false;
				return {
					index: colToAdd.index,
					name: colToAdd.name,							
					type: colToAdd.type,
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
						// the column before, the column after, and the type are the same
						( colToAdd.after === colToRemove.after 
						  && colToAdd.before === colToRemove.before 
						  && colToAdd.type === colToRemove.type ) 
						||			
						// the index and type are the same
						( colToAdd.index === colToRemove.index 
						  && colToAdd.type === colToRemove.type	)
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
		console.log( columnsToRename );
		var columnsStatus = {};
		if ( columnsToAdd.length > 0 ) columnsStatus.added = columnsToAdd;
		if ( columnsToRemove.length > 0 ) columnsStatus.removed = columnsToRemove;
		if ( columnsToRename.length > 0 ) columnsStatus.renamed = columnsToRename;
		if ( columnsToChange.length > 0 ) columnsStatus.changed = columnsToChange;

		if ( _.isEmpty( columnsStatus ) ){
			return cb( true )
		} else {
			return cb( columnsStatus);
		}
	} );	
}
TableSync.prototype.checkUniqueConstraints = function( uniqueConstraints, cb ){
	var that = this;
	var query = 'SHOW INDEXES IN ' + this.spec.name; 
	query += ' WHERE Key_name != \'PRIMARY\''; 	// not primary
	query += ' AND Non_unique = 0';	// and unique
	var defaultIndex = {
		Key_name: false,
		Column_name: false
	}
	// reformat for easy comparison
	var tableIndexes = _.map( uniqueConstraints, function( columnName ){
		var formatted = {}; 
		formatted.Key_name = 'unique_' + columnName;
		formatted.Column_name = columnName;
		return formatted;
	}); 
	// compare with indexes currently in DB
	this.db.query( query, function( dbIndexes ){
		// filter all the indexes in the spec down to the ones that aren't in the db
		var addedIndexes = [];
		var removedIndexes = [];
		var changedIndexes = [];
		tableIndexes = _.each( tableIndexes, function( tableIndex ){
			// if it doesn't refer to an existing column
			if ( ! _.findWhere( that.spec.columns, { name: tableIndex.Column_name })){
				console.log( 'Attempting to add index \'' + tableIndex.Key_name + '\' to non-existent column \'' + that.spec.name + '.' + tableIndex.Column_name + '\'' );
			}
			var foundIndex = _.findWhere( dbIndexes, { Key_name: tableIndex.Key_name }); 
			if( foundIndex ){
				// remove the inspected item from dbIndexes
				dbIndexes = _.reject( dbIndexes, function( dbIndex ){
					return dbIndex.Key_name === tableIndex.Key_name 
				});
			} else {
				addedIndexes.push( tableIndex );
			}
					
		});

		addedIndexes = _.map( addedIndexes, function( index ){
			return index.Column_name; 
		});
		// any dbIndexes left are no longer present in the spec, and so should be removed
		removedIndexes = _.map( dbIndexes, function( index ){
			return index.Column_name; 
		});	

		var indexesStatus = {};
		if ( addedIndexes.length > 0 ) indexesStatus.added = addedIndexes;
		if ( removedIndexes.length > 0 ) indexesStatus.removed = removedIndexes;

		if ( _.isEmpty( indexesStatus ) ){
			return cb( true )
		} else {
			return cb( indexesStatus);
		}		
	});
}
TableSync.prototype.checkForeignConstraints = function( specConstraints, cb ){
	if ( ! this.spec.constraints ){
		return cb( true )
	}
	var that = this;

	// first, check all the indexes on table
	var query = 'SHOW INDEXES IN ' + this.spec.name; 
	query += ' WHERE Key_name != \'PRIMARY\''; 	// not primary
	query += ' AND Non_unique = 1';	// and non-unique
	this.db.query( query, function( results ){
		var dbForeignKeys = {}; 
		_.filter( results, function( dbIndex ){
			dbForeignKeys[ dbIndex.Column_name ] = { 
				table: false,
				column: false,
				fkName: false,
				indexName: dbIndex.Key_name
			};
		});
		// then, get what foreign keys are currently active
		var query = "SELECT COLUMN_NAME,CONSTRAINT_NAME,\n" ;
		query += "REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME from information_schema.KEY_COLUMN_USAGE where\n" ;
		query += "TABLE_NAME = '" + that.spec.name + "'\n";	
		that.db.query( query, function( results ){
			var foreignKeyRecords = results; // I think that these results are all foreign keys that have actually been used
			_.each( dbForeignKeys, function( dbIndex, columnName ){
				var foundIndex = _.findWhere( foreignKeyRecords, { COLUMN_NAME: columnName });
				if ( foundIndex ){
					dbIndex.table = foundIndex.REFERENCED_TABLE_NAME;
					dbIndex.column = foundIndex.REFERENCED_COLUMN_NAME;
					dbIndex.fkName = foundIndex.CONSTRAINT_NAME;
				}
			});
			var addedConstraints = {};
			var removedConstraints = {};
			var updatedConstraints = {};
			_.each( specConstraints, function( constraintReference, columnName ){
				constraintReference.name = 'fk_' + that.spec.name + '_' + columnName;
				if ( dbForeignKeys.hasOwnProperty( columnName ) ){
					if ( dbForeignKeys[ columnName ].table === constraintReference.table ){
						if ( dbForeignKeys[ columnName ].column === constraintReference.column ){
							// identical property exists in DB, so no updated needed
						}
					} else {
						// exists, but not identical, so add to updated								
						updatedConstraints[ columnName ] = constraintReference; 
					}
					delete dbForeignKeys[ columnName ];					
				} else {
					// foreign key does not exist, so add it.

					addedConstraints[ columnName ] = constraintReference; 				
				}
			});
			// remaining dbConstraints need to be deleted 
			_.each( dbForeignKeys, function( dbConstraintReference, columnName ){
				removedConstraints[columnName] = dbConstraintReference;
			});

			var constraintsStatus = {};
			if ( ! _.isEmpty( addedConstraints ) ) constraintsStatus.added = addedConstraints;
			if ( ! _.isEmpty( removedConstraints ) ) constraintsStatus.removed = removedConstraints;
			if ( ! _.isEmpty( updatedConstraints ) ) constraintsStatus.changed = updatedConstraints;

			if ( _.isEmpty( constraintsStatus ) ){
				return cb( true )
			} else {
				return cb( constraintsStatus );
			}		
		});
	}); 
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