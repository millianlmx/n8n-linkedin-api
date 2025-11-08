import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

export class Login implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LinkedIn Login',
		name: 'linkedInLogin',
		usableAsTool: true,
		icon: 'file:linkedin.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Initialize browser and login to LinkedIn',
		defaults: {
			name: 'LinkedIn Login',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'linkedInApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Initialize and Login',
						value: 'login',
						description: 'Initialize browser and login to LinkedIn',
						action: 'Initialize and login to LinkedIn',
					},
				],
				default: 'login',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['login'],
					},
				},
				description: 'LinkedIn email (optional if set in API .env)',
				placeholder: 'your-email@example.com',
			},
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: {
					password: true,
				},
				default: '',
				displayOptions: {
					show: {
						operation: ['login'],
					},
				},
				description: 'LinkedIn password (optional if set in API .env)',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('linkedInApi');
		const baseUrl = credentials.baseUrl as string;

		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData;

				if (operation === 'login') {
					// Get email and password from node parameters or credentials
					const email = this.getNodeParameter('email', i, '') as string || credentials.email as string;
					const password = this.getNodeParameter('password', i, '') as string || credentials.password as string;

					// Step 1: Initialize browser session
					const initResponse = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/auth/init`,
						headers: {
							'Content-Type': 'application/json',
						},
						body: {},
						json: true,
					});

					const sessionId = initResponse.sessionId;

					if (!sessionId) {
						throw new Error('Failed to initialize session: No session ID returned');
					}

					// Step 2: Login with credentials
					const loginBody: any = {
						sessionId,
					};

					// Only include email/password if provided
					if (email) {
						loginBody.email = email;
					}
					if (password) {
						loginBody.password = password;
					}

					const loginResponse = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/auth/login`,
						headers: {
							'Content-Type': 'application/json',
						},
						body: loginBody,
						json: true,
					});

					// Return session ID and login status
					responseData = {
						success: loginResponse.success || true,
						sessionId: sessionId,
						message: loginResponse.message || 'Successfully logged in to LinkedIn',
						timestamp: new Date().toISOString(),
					};
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData as any),
					{ itemData: { item: i } },
				);

				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
							success: false,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
