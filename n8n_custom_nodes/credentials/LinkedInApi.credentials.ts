import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class LinkedInApi implements ICredentialType {
	name = 'linkedInApi';
	displayName = 'LinkedIn API';
	documentationUrl = 'https://github.com/yourusername/linkedin-api';
	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://linkedin-api:8080',
			description: 'The base URL of the LinkedIn API (use http://linkedin-api:8080 for Docker, http://localhost:8080 for local)',
			required: true,
		},
		{
			displayName: 'Email',
			name: 'email',
			type: 'string',
			default: '',
			description: 'LinkedIn email (optional if set in .env)',
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
			description: 'LinkedIn password (optional if set in .env)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'Content-Type': 'application/json',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/health',
			method: 'GET',
		},
	};
}
