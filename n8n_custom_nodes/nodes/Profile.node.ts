import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class Profile implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LinkedIn Profile',
		name: 'linkedInProfile',
		icon: 'file:linkedin.svg',
		usableAsTool: true,
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Interact with LinkedIn profiles',
		defaults: {
			name: 'LinkedIn Profile',
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
						name: 'Scrape Profile',
						value: 'scrapeProfile',
						description: 'Scrape a LinkedIn profile',
						action: 'Scrape a LinkedIn profile',
					},
					{
						name: 'Visit Profile',
						value: 'visitProfile',
						description: 'Visit a LinkedIn profile',
						action: 'Visit a LinkedIn profile',
					},
					{
						name: 'Get Profile Views',
						value: 'getProfileViews',
						description: 'Get who viewed your profile',
						action: 'Get profile views',
					},
				],
				default: 'scrapeProfile',
			},
			// Profile URL field for scrape and visit operations
			{
				displayName: 'Profile URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['scrapeProfile', 'visitProfile'],
					},
				},
				description: 'The LinkedIn profile URL to scrape or visit',
				placeholder: 'https://www.linkedin.com/in/username/',
			},
			// Force refresh option for scrape operation
			{
				displayName: 'Force Refresh',
				name: 'forceRefresh',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['scrapeProfile'],
					},
				},
				description: 'Whether to bypass cache and scrape fresh data from LinkedIn',
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

				if (operation === 'scrapeProfile') {
					const url = this.getNodeParameter('url', i) as string;
					const forceRefresh = this.getNodeParameter('forceRefresh', i, false) as boolean;

					const body: any = { url, forceRefresh };
					if (sessionId) body.sessionId = sessionId;

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/profile/scrape`,
						headers: {
							'Content-Type': 'application/json',
						},
						body,
						json: true,
						timeout: 60000, // 1 minute timeout
					});

					responseData = response;
				} else if (operation === 'visitProfile') {
					const url = this.getNodeParameter('url', i) as string;

					const body: any = { url };
					if (sessionId) body.sessionId = sessionId;

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/profile/visit`,
						headers: {
							'Content-Type': 'application/json',
						},
						body,
						json: true,
						timeout: 60000, // 1 minute timeout
					});

					responseData = response;
				} else if (operation === 'getProfileViews') {
					const qs: any = {};
					if (sessionId) qs.sessionId = sessionId;

					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/profile/views`,
						headers: {
							'Content-Type': 'application/json',
						},
						qs,
						json: true,
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
