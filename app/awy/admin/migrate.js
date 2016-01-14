class Awy_Admin_Migrate extends Class {
	constructor() {
		super();
	}

	async install() {
		let rules = { "rules": { 
			"admin_user": {
				".read": "auth !== null",
				".write": false,
				".indexOn": ["email"] 
			},
			"admin_role": {
				".read": false,
				".write": false 
			}
		}};
		return rules;
	}

	async upgrade() {
		console.log('admin upgrade');
	}

	async downgrade() {
		console.log('admin downgrade');
	}
}
export default Awy_Admin_Migrate