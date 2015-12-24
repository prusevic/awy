import Awy_Core_Model_View from 'awy/core/model/view.js';

class Awy_Core_View_Index extends Awy_Core_Model_View {
	constructor(params) {
		super();
		this._params = params;
		this.agree = false;
	}

	completeStep(){
		if (!this.agree) {
			alert('Please tick the agree to our terms and conditions!');
			return false;
		}


		alert(JSON.stringify(this, null, 4));
		let router = Class.i('awy_core_model_router').then( r => {
            r.navigate('install/step1');
        });
	}
}

export default Awy_Core_View_Index