import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class Search implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LinkedIn Search',
		name: 'linkedInSearch',
		icon: 'file:linkedin.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Search LinkedIn',
		defaults: {
			name: 'LinkedIn Search',
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
						name: 'Search People',
						value: 'searchPeople',
						description: 'Search for people on LinkedIn',
						action: 'Search for people',
					},
				],
				default: 'searchPeople',
			},
			{
				displayName: 'Keywords',
				name: 'keywords',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['searchPeople'],
					},
				},
				description: 'Search keywords (job title, company, skills, etc.)',
				placeholder: 'Software Engineer',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				displayOptions: {
					show: {
						operation: ['searchPeople'],
					},
				},
				description: 'Maximum number of results to return',
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
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

				if (operation === 'searchPeople') {
					const keywords = this.getNodeParameter('keywords', i) as string;
					const limit = this.getNodeParameter('limit', i, 50) as number;

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/search/people`,
						headers: {
							'Content-Type': 'application/json',
						},
						body: {
							sessionId,
							keywords,
							limit,
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
