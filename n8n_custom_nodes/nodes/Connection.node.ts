import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class Connection implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LinkedIn Connection',
		name: 'linkedInConnection',
		usableAsTool: true,
		icon: 'file:linkedin.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manage LinkedIn connections',
		defaults: {
			name: 'LinkedIn Connection',
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
						name: 'Send Connection Request',
						value: 'sendRequest',
						description: 'Send a connection request to a LinkedIn profile',
						action: 'Send a connection request',
					},
				],
				default: 'sendRequest',
			},
			{
				displayName: 'Profile URL',
				name: 'profileUrl',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendRequest'],
					},
				},
				description: 'The LinkedIn profile URL to send a connection request to',
				placeholder: 'https://www.linkedin.com/in/username/',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				displayOptions: {
					show: {
						operation: ['sendRequest'],
					},
				},
				description: 'Optional message to include with the connection request (max 300 characters)',
				placeholder: 'Hi, I would like to connect with you...',
			},
			// Session ID - now optional for backward compatibility
			{
				displayName: 'Session ID (Legacy)',
				name: 'sessionId',
				type: 'string',
				default: '',
				description: 'Optional session ID for legacy mode. Leave empty to use new singleton browser.',
				placeholder: 'Leave empty for new mode',
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
				const sessionId = this.getNodeParameter('sessionId', i, '') as string;

				if (operation === 'sendRequest') {
					const profileUrl = this.getNodeParameter('profileUrl', i) as string;
					const message = this.getNodeParameter('message', i, '') as string;

					const body: any = { profileUrl };
					if (sessionId) body.sessionId = sessionId;
					if (message) body.message = message;

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/connection/request`,
						headers: {
							'Content-Type': 'application/json',
						},
						body,
						json: true,
						timeout: 60000, // 1 minute timeout
					});

					responseData = response;
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
