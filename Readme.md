Cloud DB
=======

Why?
-----
Check out the code below to get the general idea

```
var db = require( 'cloud_db' );
db.use({
	host: 'localhost', 
	user: 'devAdmin',
	password: 'theBestCloudPW',
	database: 'cloud_db'
}).addTable( myTable ).connect( function(){
	db.table( 'myTableName' ).get({ 
		name: 'Joe' // retrieve all rows with whose column 'name' is equal to 'Joe'. Boom.
	});
});
```

Basically, you 
- register your tables so that cloud_db knows about them, 
- connect to the database
- use simple, powerful functions to retrieve and manipulate your database tables.

It includes features like:
- Syncing the database to make sure it matches what you said the table should be like
- Easy methods for validating and saving data, so you can be sure they are in the right format.
- Easily add and remove unique indexes and foreign keys to constrain your data.

Setup
-------
#### 0. A) Install 'cloud_db' as module and B) require.

```js
var db = require( 'cloud_db' );
```

#### 1. Configure connection

```js 
db.use({
	host: 'localhost', 
	user: 'devAdmin',
	password: 'theBestCloudPW',
	database: 'cloud_db'
});
```
*Uses [node-mysql](https://github.com/felixge/node-mysql) for its mysql connection, and accepts all the same options.*

#### 2. Add tables (can be before or after connecting)

```js 
var userTableSpec = { 
	name: 'string', // name of table in database
	columns: {object} // an array of columns, minus ID
};
db.addTable( userTableSpec ); // register the table
```
Detailed [below](#adding-tables)

#### 3. Connect
```js
db.connect( function(){
	myTable = db.table('myTable');
	// All CRUD operations here.
});
```
#### 4. Sync
Each table provides two methods to ensure the table spec matches the existing table in the DB. 

```js
myTable.checkSync(); // compares spec to DB, and returns a list of what it will create, remove, rename, or change
myTable.sync(); // 1) runs checkSync(), and 2) executes any necessary changes
```

Syncing will: 
- see a new column in the spec and create it
- see an extra column in the DB and remove it (if it is empty, otherwise it will simply let you know).
- recognize a renamed column and rename it.
- alter changed properties such as default and null.
- add/remove unique indexes
- add/remove foreign keys ( see table spec)

#### 5. CRUD
```js
// WAY 1
var userTable = db.table( 'User' ); // get a table
userTable.get( 5, function( results ){ // call a CRUD function (note, could be chained on previous line).
	// results is row with ID 5 from the User table.
});

// or...

// WAY 2
// same as way 1, except table name is first argument, and all the other arguments are shifted to accordingly
db.get( 'User', 5, function( results ){
	// results is row with ID 5 from the User table.
});

```

Adding Tables
-----------
#### {tableSpec} 
Pass this dude into `.addTable({tableSpec});` to define your table

```js
{
	name: 'tableName',
	columns: {
		columnName: {
			/* ==== db options (all optional) ============================================= */
			db_type: 'string', // default: 'varchar(200)'
							   // shortcut for db.type
			db: {
				type: 'string',  // default: 'varchar(200)'				
								 // you can use this, or db_type as a shortcut
								 // the literal string MySQL uses to declare the data type.
				default: bool/str/int, // default: false, the default for the column
				null: bool,   // default: true,
				unique: bool, // default: false
							  // adds a unique index to the column...forces every row to have a unique value
				foreign: { // default: false
					table: 'string', // name of the table it references
					column: 'string' // name of the column it references
									 // adds a foreign key referencing table.column (only allows values present in that column)
									 // Referenced column: 1) must be the same data type, 2) must have a unique index on it
				}
			},
			/* ==== validation options (all optional) ======================================== */
			required: bool/str, // if true, it runs the 'required' validation type, and uses that error.
								// if string, it runs the 'required' validation type, and string is the custom error message.
			validate: validation_type/regex, // see validation options,
			error: 'string' // this is an optional custom error given if the 'validate' function throws an error.

			/* ==== custom options (all optional) ================================== */
			/* ---- whatever your app needs, for things like form generation and data display  */
			title: 'Human Readable Name',
			type: 'select', 
			options: [ 'Option 1', 'Option 2', 'Option 3']
		}
	}
}
```

Validation and pre-save preparation
-----------------
- If you expect certain values in a database field, add a validation type to enforce it. 
- If you want to format the data before it is saved, add pre-save preparation to the validation type.

#### Validation

Custom validation types can be easily added (and the defaults can be overridden). 

`myTable.addValidationType( type, validationFnct, error )`

The error sets the default error, and will be overidden by individual columns 'error' string, if present.

```js
myTable.addValidationType( 'isEven', function( value ){
	return value % 2 === 0; // if false, error is logged and value is not saved.
}, 'Number must be even.' );
```

**NOTES:** 

- For simple single-column validation, you may pass in a Regex, and a custom error message.
- The default validation types include:
	- 'email', 'phone', 'file', 'number', 'url', 'zip'


#### Pre-save preparation
`myTable.onSaveValidationType( 'validation_type', prepFnct );`

For each validation type, you can optionally specify a function to format/filter the value before it is saved into the database.

#### Validation and saving examples.

**Example 1: Phone**

```js
myTable.addValidationType( 'phone', function( value ){
	var re = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
	return re.test( value );
}, 'Please enter a valid phone number' );

myTable.onSaveValidationType( 'phone', function( value ){
	var re = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
   	var toSave = value.replace(re, "($1) $2-$3");
	return toSave; 	
});
```

**Example 2: Password w/ confirmation**

We are assuming the password data has been submitted in this format:
`{ password: 'myPassword1', confirmation: 'myPassword2' }`; 

```js
myTable.addValidationType( 'passwordConfirmation', function( password ){
	if ( value.hasOwnProperty( 'confirmation' ) && value.hasOwnProperty( 'password' ) ){
		return value.confirmation === value.password;
	}
	return false;
}, 'Password and confirmation don\'t match' );

myTable.onSaveValidationType( 'passwordConfirmation', function( value ){
	return value.password;
});
```

CRUD operations
----------
All CRUD operations have been made as intuitive as possible. All possible uses are listed succintly below. Check out the [example](#full-example) section for more specifics.

**Note:** The callback has been left out for clarity, but **all accept a callback function as the last argument** 

You can only access the query results through the callback.

#### .create()

- `table.create( {updateArgs} )` // boom, add a DB entry (no ID, please)
	- returns full row from database.

#### .get()

- `.get()` // retrieves all rows in table (returns array of rows)
- `.get( {getArgs} )` // retrieves all entries that match the object (returns array of rows)
- `.getOne( {getArgs} )` // retrieves the first of all entries that match (returns single row)
- `.get( ID )` // retrieves a single row by ID (returns single row)
- `.get( [ 1, 2, 3 ])` // retrieves rows by ID ( shorthand for { ID: [ 1, 2, 3 ] })
#### .update()

- `.update( ID, {updateArgs} );` // update one row by ID with updateArgs
- `.update( {updateArgs} );` // as long as ID exists in the first argument, it uses the rest as update arguments
	- so...you could retrieve a DB row, change something, and pass it in here, and it would update.
	- Boom.
- `.update( {getArgs}, {updateArgs} );` // update all db matching getArgs (no ID, obviously) with updateArgs

#### .delete()

- `.delete( ID )` // delete row by ID
- `.delete( {getArgs} )` // delete all rows that match the given parameters. 
	- If object has ID, then only that row is deleted, so you can pass in a row to delete it.


#### {updateArgs}
```js
{
	// KEYS: any column in the table spec, (and the addition of the ID field)
	// VALUES: any value 
		// that the MySQL datatype for that row supports, 
		// that also passes the 'required' and 'validate' spec (if provided)
	id: {int},
	col_name: {int/str/bool}, // false and null evaluate to 'NULL' in the database,
	another_col_name: {int/str/bool},
}
```

#### {getArgs}
```js
{
	/* ==== SELECT WHERE ============================================= */
	/* ---- KEYS: any column in the table spec, (and the addition of the ID field) -- */
	/* ---- VALUES: any value. Retrieved rows must match it exactly. -- */
		// except false and null both evaluate to null.
		// you can pass in an array, and it will retrieve all rows that match
			// eg. id: [ 1,5, 31] will retrieve all posts with IDs 1,5, or 31
			// eg. name: ['Joe', 'Sarah']
	id: {int},
	col_name: {int/str/bool}, // false and null evaluate to 'NULL' in the database,
	another_col_name: {int/str/bool},

	/* ====  GROUPING/ORDERING/ARRANGING (is there a term for this?) ====================== */
	/* ---- all following can be either lower or uppercase ---*/
	SELECT: {str/array}, // which column(s) to select from the row,
	LIMIT: {int}, 
	OFFSET: {int},
	ORDER: {str},
	ORDERBY: {str},
	GROUPBY: {str}
}
```

Full Example
=========
```js
var db = require( 'cloud_db');
var userTableSpec = {
	name: 'User', 
	columns: {
		name: {
			db_type: 'varchar(200)',
			required: 'You must give the user a name',
		},
		time_added: {
			// example of customized db row
			db: {
				type: 'timestamp',
				'default': 'CURRENT_TIMESTAMP',
				'null': false
			},
		},
		gender: {
			db_type: 'varchar(10)',
			// example of custom column data for generating field, etc
			title: 'Gender',
			description: 'Choose male or female',
			type: 'select',
			options: [ 'Male', 'Female']
		}, 
		zip: {
			db_type: 'int(5)',
			// example of validation with custom message
			validate: 'zip',
			error: 'My custom ZIP error',
		}
	}
}
db.use({
	host: 'localhost', 
	user: 'userName',
	password: 'theBestPW',
	database: 'dbName'
}).addTable( userTableSpec ).connect( function(){
	var userTable = db.table( 'User' ); 

	// if it is your first time using the table, or if the spec has changed, call 
	userTable.sync() // to update it ( or .checkSync() to just check the status );

	// create
	userTable.create({
		name: 'My First User', // if not present, will trigger error and fail
		gender: 'Male', // completely optional
		zip: 55555 // anything not five numbers will trigger error and fail
	}, function( newUserRow ){
		// yeah! we added it!
	});
	
	// get
	userTable.get( 1, function( userByID ){
		// yeah, we got a user by ID
	})	
	userTable.get({ zip: 55555 }, function( usersWithZip ){
		// yeah, we got users by ZIP!
	});

	// update
	userTable.update({ zip: 55555 }, { name: 'Sarah' }, function( updatedUsers ){
		// yeah, all users with ZIP 55555 are now named Sarah!
	});
	userTable.update( 1, { name: 'Gerald' }, function( updatedUser ){
		// yeah, updated row 1 to have the name Gerald.
	}); 
	userTable.update({ 
		ID: 1, 
		zip: '2222a'
	}, function( updatedUser ){
		// no updated user, because the zip didn't pass validation.
		// otherwise, it would update user 1's name to Peter.
	});	

	// delete
	userTable.delete( 1, function( wasDeleted ){
		// bam, user 1 gone.
	});
	userTable.delete({ name: 'Sarah', zip: 33333}, function( wasDeleted ){
		// bam, all Sarahs with zip 33333 are deleted.
	});

});
```

