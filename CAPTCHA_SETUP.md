# 2Captcha Integration Guide

## Overview

This API integrates with [2Captcha](https://2captcha.com) to automatically solve LinkedIn's reCAPTCHA v2 challenges during login. This eliminates the need for manual CAPTCHA solving and enables fully automated workflows.

## How It Works

1. **Detection**: When you attempt to login, the system automatically detects if LinkedIn presents a reCAPTCHA challenge
2. **Submission**: The CAPTCHA details (site key and page URL) are sent to 2Captcha's API
3. **Solving**: 2Captcha workers solve the CAPTCHA (typically takes 30-60 seconds)
4. **Injection**: The solution token is automatically injected into the page
5. **Completion**: Login proceeds automatically

## Setup Instructions

### Step 1: Get Your 2Captcha API Key

1. Visit [2captcha.com](https://2captcha.com)
2. Create an account
3. Add funds to your account (minimum $3)
4. Go to your [Dashboard](https://2captcha.com/enterpage)
5. Copy your API key

### Step 2: Configure the API

Add your API key to the `.env` file:

```bash
# In your .env file
CAPTCHA_API_KEY=your_actual_api_key_here
```

**Important**: Use `CAPTCHA_API_KEY` (not `2CAPTCHA_API_KEY`) because environment variable names cannot start with a number in Node.js.

### Step 3: Test It

Start the server and attempt to login:

```bash
npm run dev
```

If LinkedIn presents a CAPTCHA, you'll see:

```
🔒 reCAPTCHA challenge detected!
🤖 Attempting to solve CAPTCHA automatically...
🔑 Found reCAPTCHA site key: 6LfxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxQ...
🤖 Sending CAPTCHA to 2Captcha for solving...
⏳ This may take 30-60 seconds...
✅ CAPTCHA solved successfully!
💉 Injecting CAPTCHA solution into page...
✅ CAPTCHA solution injected successfully
✅ CAPTCHA challenge handled successfully
✅ CAPTCHA solved! Waiting for page to process...
✅ Login successful
```

## Pricing

2Captcha charges per CAPTCHA solved:

- **reCAPTCHA v2**: $2.99 per 1000 CAPTCHAs
- **Minimum deposit**: $3.00
- **Payment methods**: PayPal, Bitcoin, Visa, Mastercard, etc.

**Example costs:**
- 10 logins with CAPTCHA: ~$0.03
- 100 logins with CAPTCHA: ~$0.30
- 1000 logins with CAPTCHA: ~$2.99

## Features

### Automatic Detection
The system automatically detects reCAPTCHA v2 challenges by:
- Looking for reCAPTCHA iframes
- Checking for `.g-recaptcha` elements
- Scanning for `data-sitekey` attributes

### Smart Site Key Extraction
Multiple methods to extract the site key:
1. `data-sitekey` attribute
2. iframe `src` parameter
3. Script tag content scanning

### Robust Injection
The solution is injected using multiple techniques:
- Direct textarea value setting
- grecaptcha API callback triggering
- Custom callback function execution

## Troubleshooting

### "2Captcha service not available"
**Cause**: API key not configured or invalid

**Solution**: 
1. Check your `.env` file has `CAPTCHA_API_KEY` set (not `2CAPTCHA_API_KEY`)
2. Verify the API key is correct (not `your_2captcha_api_key`)
3. Restart the server after updating `.env`
4. Make sure there are no quotes around the API key value

### "Failed to solve CAPTCHA"
**Cause**: 2Captcha service error or insufficient balance

**Solution**:
1. Check your 2Captcha account balance
2. Verify your API key is active
3. Check 2Captcha service status

### "Could not extract reCAPTCHA site key"
**Cause**: CAPTCHA structure changed or not fully loaded

**Solution**:
1. Wait a few seconds and try again
2. Check if LinkedIn changed their CAPTCHA implementation
3. Open an issue with the page HTML for investigation

## Manual Fallback

If 2Captcha is not configured or fails, you can:

1. **Solve manually**: The browser window will remain open - solve the CAPTCHA by hand
2. **Use force-authenticate**: After solving manually, call:
   ```bash
   POST /api/auth/force-authenticate
   {
     "sessionId": "your-session-id"
   }
   ```

## Security Notes

- ✅ API key is stored in `.env` (not committed to git)
- ✅ All communication with 2Captcha is over HTTPS
- ✅ No CAPTCHA images are stored locally
- ✅ Tokens are used immediately and not logged

## Advanced Configuration

### Disable CAPTCHA Solving

To disable automatic CAPTCHA solving, simply don't set the `CAPTCHA_API_KEY` in your `.env` file, or set it to:

```bash
CAPTCHA_API_KEY=your_2captcha_api_key
```

### Custom Timeout

The system waits up to 60 seconds for CAPTCHA solving. This is handled automatically by the 2Captcha library.

## API Reference

### CaptchaService Methods

```typescript
// Check if service is available
CaptchaService.isAvailable(): boolean

// Detect reCAPTCHA on page
CaptchaService.detectRecaptcha(page: Page): Promise<boolean>

// Extract site key
CaptchaService.extractSiteKey(page: Page): Promise<string | null>

// Solve reCAPTCHA v2
CaptchaService.solveRecaptchaV2(page: Page, pageUrl: string): Promise<string | null>

// Inject solution
CaptchaService.injectCaptchaSolution(page: Page, solution: string): Promise<boolean>

// Complete workflow
CaptchaService.handleRecaptchaChallenge(page: Page): Promise<boolean>
```

## Support

For issues with:
- **2Captcha service**: Contact [2Captcha support](https://2captcha.com/support)
- **This integration**: Open an issue on GitHub
- **LinkedIn changes**: Report in issues with screenshots

## Resources

- [2Captcha Documentation](https://2captcha.com/2captcha-api)
- [2Captcha Pricing](https://2captcha.com/pricing)
- [reCAPTCHA v2 Documentation](https://developers.google.com/recaptcha/docs/display)
