import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class Messaging implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LinkedIn Messaging',
		name: 'linkedInMessaging',
		icon: 'file:linkedin.svg',
		usableAsTool: true,
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manage LinkedIn messages',
		defaults: {
			name: 'LinkedIn Messaging',
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
						name: 'List Conversations',
						value: 'listConversations',
						description: 'Get all conversations',
						action: 'List all conversations',
					},
					{
						name: 'Get Unread Messages',
						value: 'getUnread',
						description: 'Get unread messages',
						action: 'Get unread messages',
					},
					{
						name: 'Read Conversation',
						value: 'readConversation',
						description: 'Read a specific conversation',
						action: 'Read a conversation',
					},
					{
						name: 'Send Message',
						value: 'sendMessage',
						description: 'Send a message in a conversation',
						action: 'Send a message',
					},
					{
						name: 'Get Conversation URL',
						value: 'getConversationUrl',
						description: 'Get conversation URL from a profile URL',
						action: 'Get conversation URL from profile',
					},
				],
				default: 'listConversations',
			},
			// Read Conversation fields
			{
				displayName: 'Conversation URL',
				name: 'conversationUrl',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['readConversation'],
					},
				},
				description: 'The LinkedIn conversation URL',
				placeholder: 'https://www.linkedin.com/messaging/thread/...',
			},
			{
				displayName: 'Profile URL (for caching)',
				name: 'profileUrlForCache',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['readConversation'],
					},
				},
				description: 'LinkedIn profile URL to use as cache key (optional but recommended)',
				placeholder: 'https://www.linkedin.com/in/username/',
			},
			{
				displayName: 'Force Refresh',
				name: 'forceRefresh',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['readConversation'],
					},
				},
				description: 'Whether to bypass cache and fetch fresh data from LinkedIn',
			},
			// Get Conversation URL fields
			{
				displayName: 'Profile URL',
				name: 'profileUrl',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['getConversationUrl'],
					},
				},
				description: 'The LinkedIn profile URL to get conversation for',
				placeholder: 'https://www.linkedin.com/in/username/',
			},
			// Send Message fields
			{
				displayName: 'Conversation ID',
				name: 'conversationId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
					},
				},
				description: 'The conversation ID to send the message to',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
					},
				},
				description: 'The message content to send',
				placeholder: 'Type your message here...',
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

				if (operation === 'listConversations') {
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/messages/conversations`,
						headers: {
							'Content-Type': 'application/json',
						},
						qs: {
							sessionId,
						},
						json: true,
					});

					responseData = response;
				} else if (operation === 'getUnread') {
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/messages/unread`,
						headers: {
							'Content-Type': 'application/json',
						},
						qs: {
							sessionId,
						},
						json: true,
					});

					responseData = response;
				} else if (operation === 'readConversation') {
					const conversationUrl = this.getNodeParameter('conversationUrl', i) as string;
					const profileUrlForCache = this.getNodeParameter('profileUrlForCache', i, '') as string;
					const forceRefresh = this.getNodeParameter('forceRefresh', i, false) as boolean;

					const queryParams: any = {
						sessionId,
						conversationUrl,
					};

					// Add optional parameters if provided
					if (profileUrlForCache) {
						queryParams.profileUrl = profileUrlForCache;
					}
					if (forceRefresh) {
						queryParams.forceRefresh = 'true';
					}

					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/messages/conversation`,
						headers: {
							'Content-Type': 'application/json',
						},
						qs: queryParams,
						json: true,
					});

					responseData = response;
				} else if (operation === 'sendMessage') {
					const conversationId = this.getNodeParameter('conversationId', i) as string;
					const message = this.getNodeParameter('message', i) as string;

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/messages/send`,
						headers: {
							'Content-Type': 'application/json',
						},
						body: {
							sessionId,
							conversationId,
							message,
						},
						json: true,
					});

					responseData = response;
				} else if (operation === 'getConversationUrl') {
					const profileUrl = this.getNodeParameter('profileUrl', i) as string;

					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/messages/conversation-url`,
						headers: {
							'Content-Type': 'application/json',
						},
						qs: {
							sessionId,
							profileUrl,
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
