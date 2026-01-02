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
						name: 'Initialize',
						value: 'initialize',
						description: 'Initialize browser (new simplified mode - no session ID needed)',
						action: 'Initialize browser',
					},
					{
						name: 'Initialize and Login (Legacy)',
						value: 'login',
						description: 'Initialize browser and login to LinkedIn (returns session ID for backward compatibility)',
						action: 'Initialize and login to LinkedIn',
					},
					{
						name: 'Login',
						value: 'loginOnly',
						description: 'Login to LinkedIn (after Initialize)',
						action: 'Login to LinkedIn',
					},
					{
						name: 'Get Status',
						value: 'getStatus',
						description: 'Get current authentication status',
						action: 'Get authentication status',
					},
					{
						name: 'Logout',
						value: 'logout',
						description: 'Logout and close browser session',
						action: 'Logout and close browser session',
					},
					{
						name: 'Force Authenticate',
						value: 'forceAuthenticate',
						description: 'Force mark session as authenticated (workaround for timeouts)',
						action: 'Force authenticate session',
					},
					{
						name: 'Get Active Sessions (Legacy)',
						value: 'getActiveSessions',
						description: 'Retrieve the list of active sessions',
						action: 'Get active sessions',
					},
				],
				default: 'initialize',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['login', 'loginOnly', 'initialize'],
					},
				},
				description: 'LinkedIn email (optional if set in API .env). Used to restore saved browser state.',
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
						operation: ['login', 'loginOnly'],
					},
				},
				description: 'LinkedIn password (optional if set in API .env)',
			},
			{
				displayName: 'Session ID (Legacy)',
				name: 'sessionId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['logout', 'forceAuthenticate'],
					},
				},
				description: 'Optional session ID for legacy mode. Leave empty to use new singleton browser.',
				placeholder: 'Leave empty for new mode or enter session ID for legacy',
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

				if (operation === 'initialize') {
					// New simplified initialization - no session ID needed
					const email = this.getNodeParameter('email', i, '') as string || credentials.email as string;

					const initResponse = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/auth/initialize`,
						headers: {
							'Content-Type': 'application/json',
						},
						body: email ? { email } : {},
						json: true,
						timeout: 120000, // 2 minutes for browser initialization
					});

					responseData = {
						success: initResponse.success,
						sessionRestored: initResponse.sessionRestored || false,
						isAuthenticated: initResponse.isAuthenticated || false,
						message: initResponse.message || 'Browser initialized',
						timestamp: new Date().toISOString(),
					};
				} else if (operation === 'login') {
					// Legacy mode: Initialize + Login with session ID
					const email = this.getNodeParameter('email', i, '') as string || credentials.email as string;
					const password = this.getNodeParameter('password', i, '') as string || credentials.password as string;

					// Step 1: Initialize browser session (legacy endpoint)
					const initResponse = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/auth/init`,
						headers: {
							'Content-Type': 'application/json',
						},
						body: email ? { email } : {},
						json: true,
						timeout: 120000,
					});

					const sessionId = initResponse.sessionId;

					if (!sessionId) {
						throw new Error('Failed to initialize session: No session ID returned');
					}

					// If session was already restored, we're done
					if (initResponse.sessionRestored) {
						responseData = {
							success: true,
							sessionId: sessionId,
							sessionRestored: true,
							message: 'Session restored from saved state',
							timestamp: new Date().toISOString(),
						};
					} else {
						// Step 2: Login with credentials
						const loginBody: any = { sessionId };
						if (email) loginBody.email = email;
						if (password) loginBody.password = password;

						const loginResponse = await this.helpers.httpRequest({
							method: 'POST',
							url: `${baseUrl}/api/auth/login`,
							headers: {
								'Content-Type': 'application/json',
							},
							body: loginBody,
							json: true,
							timeout: 120000,
						});

						responseData = {
							success: loginResponse.success || true,
							sessionId: sessionId,
							sessionRestored: loginResponse.sessionRestored || false,
							message: loginResponse.message || 'Successfully logged in to LinkedIn',
							timestamp: new Date().toISOString(),
						};
					}
				} else if (operation === 'loginOnly') {
					// Login only (assumes browser is already initialized)
					const email = this.getNodeParameter('email', i, '') as string || credentials.email as string;
					const password = this.getNodeParameter('password', i, '') as string || credentials.password as string;

					const loginBody: any = {};
					if (email) loginBody.email = email;
					if (password) loginBody.password = password;

					const loginResponse = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/auth/login`,
						headers: {
							'Content-Type': 'application/json',
						},
						body: loginBody,
						json: true,
						timeout: 120000,
					});

					responseData = {
						success: loginResponse.success,
						sessionRestored: loginResponse.sessionRestored || false,
						message: loginResponse.message || 'Login successful',
						timestamp: new Date().toISOString(),
					};
				} else if (operation === 'getStatus') {
					// Get authentication status
					const statusResponse = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/auth/status`,
						headers: {
							'Content-Type': 'application/json',
						},
						json: true,
					});

					responseData = {
						success: statusResponse.success,
						ready: statusResponse.ready,
						authenticated: statusResponse.authenticated,
						hasMonitoring: statusResponse.hasMonitoring,
						userIdentifier: statusResponse.userIdentifier,
						timestamp: new Date().toISOString(),
					};
				} else if (operation === 'logout') {
					const sessionId = this.getNodeParameter('sessionId', i, '') as string;

					const logoutResponse = await this.helpers.httpRequest({
						method: 'DELETE',
						url: `${baseUrl}/api/auth/logout`,
						headers: {
							'Content-Type': 'application/json',
						},
						body: sessionId ? { sessionId } : {},
						json: true,
					});

					responseData = {
						success: logoutResponse.success || true,
						message: logoutResponse.message || 'Successfully logged out',
						timestamp: new Date().toISOString(),
					};
				} else if (operation === 'forceAuthenticate') {
					const sessionId = this.getNodeParameter('sessionId', i, '') as string;

					const forceAuthResponse = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/auth/force-authenticate`,
						headers: {
							'Content-Type': 'application/json',
						},
						body: sessionId ? { sessionId } : {},
						json: true,
					});

					responseData = {
						success: forceAuthResponse.success,
						message: forceAuthResponse.message,
						currentUrl: forceAuthResponse.currentUrl,
						timestamp: new Date().toISOString(),
					};
				} else if (operation === 'getActiveSessions') {
					const sessionsResponse = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/auth/sessions`,
						headers: {
							'Content-Type': 'application/json',
						},
						json: true,
					});

					responseData = {
						success: true,
						sessions: sessionsResponse.sessions || [],
						count: sessionsResponse.count || 0,
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
