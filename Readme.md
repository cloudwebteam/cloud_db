Cloud DB
=======

Setup
-------
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
			// db options
			db_type: str, // shortcut for db.type
			db: {
				type: str, // either this or db_type. the literal string MySQL uses to declare the cell type.
							// eg. 'varchar(200)'
				'default': false, // optional,
				'null': true // optional
			},

			// validation options
			required: bool/str, // if string, it IS required, and string is a custom error message.
			validate: validation_type/regex, // see [validation options](#validation),
			error: str // if validate type is provided, this is an optional custom error given.

			// other options (all optional, whatever your app needs).
			// for things like form generation and data display.
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
`validator.addType( type, validationFnct, error )`

Custom validation types can be easily added (and the defaults can be overridden). 

The error is the default, and is overidden by individual columns 'error' string, if present.

```js
myTable.addValidationType( 'isEven', function( value ){
	return value % 2 === 0; // if false, error is logged and value is not saved.
}, 'Number must be even.' );
```

The default validation types included are:
	- 'email', 'phone', 'file', 'number', 'url', 'zip'
 
#### Pre-save preparation
`myTable.onSaveValidationType( 'validation_type', prepFnct );`

For each validation type, you can optionally specify a function to format/filter the value before it is saved into the database.

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
All CRUD operations have been made as intuitive as possible. All possible uses are listed succintly below. Check out the [examples](#examples) section for more specifics.

**Note:** The callback has been left out for clarity, but **all accept a callback function as the last argument** 

You can only access the query results through the callback.

#### .create()

- `table.create( {args} )` // boom, add a DB entry
	- returns full row from database.

#### .get()

- `.get()` // retrieves all rows in table (returns array of rows)
- `.get( {getArgs} )` // retrieves all entries that match the object (returns array of rows)
- `.getOne( {getArgs} )` // retrieves the first of all entries that match (returns single row)
- `.get( int )` // retrieves a single row by ID (returns single row)

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

#### {getArgs}
```js
{
	// KEYS: any column in the table spec, plus ID
	// VALUES: any value. Retrieve rows must match it exactly.
		// except false and null both evaluate to null.
	id: {int},
	col_name: {int/str/bool}, // false and null evaluate to 'NULL' in the database,
	another_col_name: {int/str/bool},

	// GROUPING/ORDERING/ARRANGING (is there a term for this?)
	// all following can be either lower or uppercase
	SELECT: {str/array}, // which column(s) to select from the row,
	LIMIT: {int}, 
	OFFSET: {int},
	ORDER: {str},
	ORDERBY: {str},
	GROUPBY: {str}
}
```

#### {updateArgs}
```js
{
	// KEYS: any column in the table spec, plus ID
	// VALUES: any value 
		// that the MySQL datatype for that row supports, 
		// that also passes the 'validate' and 'required' spec (if provided)
	id: {int},
	col_name: {int/str/bool}, // false and null evaluate to 'NULL' in the database,
	another_col_name: {int/str/bool},
}
```

