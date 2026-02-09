import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

export class CompanySearch implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LinkedIn Company Search',
		name: 'linkedInCompanySearch',
		icon: 'file:linkedin.svg',
		usableAsTool: true,
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Search LinkedIn for companies',
		defaults: {
			name: 'LinkedIn Company Search',
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
						name: 'Search Companies',
						value: 'searchCompanies',
						description: 'Search for companies on LinkedIn',
						action: 'Search for companies',
					},
				],
				default: 'searchCompanies',
			},
			{
				displayName: 'Keywords',
				name: 'keywords',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['searchCompanies'],
					},
				},
				description: 'Search keywords (company name, industry, etc.)',
				placeholder: 'agence web',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 10,
				displayOptions: {
					show: {
						operation: ['searchCompanies'],
					},
				},
				description: 'Maximum number of results to return',
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
			},
			{
				displayName: 'Company Size',
				name: 'companySize',
				type: 'multiOptions',
				default: [],
				displayOptions: {
					show: {
						operation: ['searchCompanies'],
					},
				},
				description: 'Filter by company size',
				options: [
					{ name: '1-10', value: 'B' },
					{ name: '11-50', value: 'C' },
					{ name: '51-200', value: 'D' },
					{ name: '201-500', value: 'E' },
					{ name: '501-1000', value: 'F' },
					{ name: '1001-5000', value: 'G' },
					{ name: '5001-10000', value: 'H' },
					{ name: '10001+', value: 'I' },
				],
			},
			{
				displayName: 'Industry IDs',
				name: 'industry',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['searchCompanies'],
					},
				},
				description: 'Comma-separated LinkedIn industry IDs (e.g. "96" for IT Services)',
				placeholder: '96',
			},
			{
				displayName: 'Location IDs',
				name: 'location',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['searchCompanies'],
					},
				},
				description: 'Comma-separated LinkedIn geo IDs (e.g. "105015875" for France)',
				placeholder: '105015875',
			},
			{
				displayName: 'Session ID (Legacy)',
				name: 'sessionId',
				type: 'string',
				default: '',
				description: 'Optional: Session ID for legacy mode. Leave empty for new singleton browser mode.',
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

				if (operation === 'searchCompanies') {
					const keywords = this.getNodeParameter('keywords', i) as string;
					const limit = this.getNodeParameter('limit', i, 10) as number;
					const companySize = this.getNodeParameter('companySize', i, []) as string[];
					const industryRaw = this.getNodeParameter('industry', i, '') as string;
					const locationRaw = this.getNodeParameter('location', i, '') as string;

					const body: any = {
						keywords,
						limit,
					};
					if (companySize.length) body.companySize = companySize;
					if (industryRaw) body.industry = industryRaw.split(',').map((s: string) => s.trim());
					if (locationRaw) body.location = locationRaw.split(',').map((s: string) => s.trim());
					if (sessionId) body.sessionId = sessionId;

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/search/companies`,
						headers: {
							'Content-Type': 'application/json',
						},
						body,
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
