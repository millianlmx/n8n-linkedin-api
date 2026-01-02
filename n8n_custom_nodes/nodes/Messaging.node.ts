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
					{
						name: 'Start Monitoring',
						value: 'startMonitoring',
						description: 'Start message monitoring in a separate browser tab',
						action: 'Start message monitoring',
					},
					{
						name: 'Stop Monitoring',
						value: 'stopMonitoring',
						description: 'Stop message monitoring',
						action: 'Stop message monitoring',
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
				displayName: 'Conversation URL',
				name: 'conversationUrlForSend',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
					},
				},
				description: 'The LinkedIn conversation URL to send the message to',
				placeholder: 'https://www.linkedin.com/messaging/thread/...',
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
			{
				displayName: 'Profile URL (for cache update)',
				name: 'profileUrlForSend',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
					},
				},
				description: 'LinkedIn profile URL to update cache with sent message (optional but recommended for message monitoring)',
				placeholder: 'https://www.linkedin.com/in/username/',
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

				if (operation === 'listConversations') {
					const qs: any = {};
					if (sessionId) qs.sessionId = sessionId;

					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/messages/conversations`,
						headers: {
							'Content-Type': 'application/json',
						},
						qs,
						json: true,
						timeout: 60000,
					});

					responseData = response;
				} else if (operation === 'getUnread') {
					const qs: any = {};
					if (sessionId) qs.sessionId = sessionId;

					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/messages/unread`,
						headers: {
							'Content-Type': 'application/json',
						},
						qs,
						json: true,
						timeout: 60000,
					});

					responseData = response;
				} else if (operation === 'readConversation') {
					const conversationUrl = this.getNodeParameter('conversationUrl', i) as string;
					const profileUrlForCache = this.getNodeParameter('profileUrlForCache', i, '') as string;
					const forceRefresh = this.getNodeParameter('forceRefresh', i, false) as boolean;

					const queryParams: any = { conversationUrl };
					if (sessionId) queryParams.sessionId = sessionId;
					if (profileUrlForCache) queryParams.profileUrl = profileUrlForCache;
					if (forceRefresh) queryParams.forceRefresh = 'true';

					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/messages/conversation`,
						headers: {
							'Content-Type': 'application/json',
						},
						qs: queryParams,
						json: true,
						timeout: 60000,
					});

					responseData = response;
				} else if (operation === 'sendMessage') {
					const conversationUrl = this.getNodeParameter('conversationUrlForSend', i) as string;
					const message = this.getNodeParameter('message', i) as string;
					const profileUrlForSend = this.getNodeParameter('profileUrlForSend', i, '') as string;

					const requestBody: any = {
						conversationUrl,
						message,
					};
					if (sessionId) requestBody.sessionId = sessionId;
					if (profileUrlForSend) requestBody.profileUrl = profileUrlForSend;

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/messages/send`,
						headers: {
							'Content-Type': 'application/json',
						},
						body: requestBody,
						json: true,
						timeout: 60000,
					});

					responseData = response;
				} else if (operation === 'getConversationUrl') {
					const profileUrl = this.getNodeParameter('profileUrl', i) as string;

					const qs: any = { profileUrl };
					if (sessionId) qs.sessionId = sessionId;

					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/messages/conversation-url`,
						headers: {
							'Content-Type': 'application/json',
						},
						qs,
						json: true,
						timeout: 120000, // 2 minutes timeout for this operation
					});

					responseData = response;
				} else if (operation === 'startMonitoring') {
					const body: any = {};
					if (sessionId) body.sessionId = sessionId;

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/messages/monitoring/start`,
						headers: {
							'Content-Type': 'application/json',
						},
						body,
						json: true,
						timeout: 30000,
					});

					responseData = {
						success: response.success,
						message: response.message || 'Message monitoring started',
						timestamp: new Date().toISOString(),
					};
				} else if (operation === 'stopMonitoring') {
					const body: any = {};
					if (sessionId) body.sessionId = sessionId;

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/messages/monitoring/stop`,
						headers: {
							'Content-Type': 'application/json',
						},
						body,
						json: true,
						timeout: 30000,
					});

					responseData = {
						success: response.success,
						message: response.message || 'Message monitoring stopped',
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
