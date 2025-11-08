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
				displayName: 'Session ID',
				name: 'sessionId',
				type: 'string',
				default: '={{$json.sessionId}}',
				required: true,
				description: 'Session ID from LinkedIn Login node',
				placeholder: 'Session ID from previous node',
			},
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
			// Scrape Profile fields
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
				const sessionId = this.getNodeParameter('sessionId', i) as string;

				if (operation === 'scrapeProfile') {
					const url = this.getNodeParameter('url', i) as string;

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/profile/scrape`,
						headers: {
							'Content-Type': 'application/json',
						},
						body: {
							sessionId,
							url,
						},
						json: true,
					});

					responseData = response;
				} else if (operation === 'visitProfile') {
					const url = this.getNodeParameter('url', i) as string;

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/profile/visit`,
						headers: {
							'Content-Type': 'application/json',
						},
						body: {
							sessionId,
							url,
						},
						json: true,
					});

					responseData = response;
				} else if (operation === 'getProfileViews') {
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/profile/views`,
						headers: {
							'Content-Type': 'application/json',
						},
						qs: {
							sessionId,
						},
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
