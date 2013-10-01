var _ = require( 'underscore' );
function Validator(){
}
Validator.prototype.checkAgainstTable = function( values, tableSpec ){
	var that = this;

	var errors = {};
	_.each( values, function( value, fieldName ){
		if ( ! tableSpec.hasOwnProperty( fieldName )){
			return;
		}
		var spec = tableSpec[ fieldName ];

		var required = spec.hasOwnProperty( 'required' ) ? spec.required : false;
		var validateAs = spec.hasOwnProperty( 'validate' ) ? spec.validate : false;
		var errorMessage = spec.hasOwnProperty( 'error' ) ? spec.error : that._typeErrors[ validateAs ];

		if ( !!required ){
			if ( ! that.is( 'notEmpty', value )){
				var requiredMessage = _.isString( required ) ? required : 'Required';
				errors[ fieldName ] = requiredMessage ; 
				return;
			}
		}
		if ( validateAs && ! that.is( validateAs, value ) ){
			errors[ fieldName ] = errorMessage ; 
		}
		
	}); 
	if ( _.isEmpty( errors )){
		return {
			passed: true,
			toSave: this.prepareToSave( values, tableSpec ) 
		};
	} else {
		return {
			passed: false,
			errors: errors 
		};
	}
}
Validator.prototype.prepareToSave = function( values, tableSpec ){
	var that = this;

	var toSave = {};
	_.each( values, function( value, fieldName ){
		if ( ! tableSpec.hasOwnProperty( fieldName )){
			return;
		}
		var spec = tableSpec[ fieldName ];
		var validateAs = spec.hasOwnProperty( 'validate' ) ? spec.validate : false;
		if ( validateAs ){
			if ( that._typeSaves.hasOwnProperty( validateAs )){
				toSave[ fieldName ] = that._typeSaves[ validateAs ]( value );
				return;
			}
		}
		toSave[ fieldName ] = value;
	}); 
	return toSave ; 

}
Validator.prototype.is = function( type, value ){
	if ( type instanceof RegExp){
 		return this._types.regex( value, type ); 
	}
	if ( ! this._types.hasOwnProperty( type )){
		console.log( '"' + type + '" is not a recognized validation type' )
		return false;
	}
	return this._types[ type ]( value );
};
Validator.prototype.addType = function( type, fnct, error ){
	this._typeErrors[ type ] = error; 	
	this._types[ type ] = fnct;
	if ( !error ) error = 'Error with value'; 
}
Validator.prototype._typeErrors = {};
Validator.prototype._types = {
	// used for 'required'
	notEmpty: function( value ){
		if ( ! value ){
			if ( value !== 0 ){
				return false;
			}
		}
		return true;
	},	
	regex: function( value, regex ){
		return regex.test(value);
	}
}
Validator.prototype.onSave = function( type, fnct ){
	this._typeSaves[ type ] = fnct; 
}
Validator.prototype._typeSaves = {
}


var validator = new Validator();

// add default validation methods
validator.addType( 'email', email, 'Please enter a valid email' );
validator.addType( 'phone', phone, 'Please enter a valid phone number' );
validator.addType( 'file', file, 'Does not seem like a valid filename' );
validator.addType( 'number', number, 'Please enter a number' );
validator.addType( 'password_confirmation', password_confirmation, 'Please make sure these match' )
validator.addType( 'url', url, 'Please enter a valid URL' );
validator.addType( 'zip', zip, 'Please enter a valid ZIP code.' );

validator.onSave( 'phone', savePhone );
validator.onSave( 'password', savePassword );

module.exports = validator; 

/* ==== VALIDATION ============================================= */
function email( value ){
    var re = /\S+@\S+\.\S+/;
    return re.test(value);
}
function file( value ){
	return ! ( value.length < 3 || value.indexOf( '.' ) === -1 );
}
function number( value ){
	return ! isNaN( parseFloat(value) ) && isFinite(value);
}
function password_confirmation( value ){
	if ( value.hasOwnProperty( 'confirmation' ) && value.hasOwnProperty( 'password' ) ){
		return value.confirmation === value.password;
	}
	return false;
}
function phone( value ){
	var re = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
	return re.test( value );
}
function url( value ){
	var re = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
	return re.test( value );
}
function zip( value ){
	var re = /^[\d]{5}$/; 
	return re.test( value );
}

/* ==== PRE-SAVE FUNCTIONS ============================================= */
// these assume all the input has been validated
function savePhone( value ){
	var re = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
   	var toSave = value.replace(re, "($1) $2-$3");
	
	return toSave; 
}
function savePassword( value ){
	var toSave = value.password; 
	return toSave;
}