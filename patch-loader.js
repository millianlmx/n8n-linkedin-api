const fs = require('fs');
const { execSync } = require('child_process');

try {
    console.log('Searching for directory-loader.js...');
    // 1. Find the file dynamically
    const filePath = execSync('find /usr/local/lib/node_modules/n8n -name directory-loader.js', { encoding: 'utf8' }).trim();
    
    if (!filePath) {
        console.error('ERROR: directory-loader.js not found');
        process.exit(1);
    }
    console.log('Found file at:', filePath);

    // 2. Read content
    let content = fs.readFileSync(filePath, 'utf8');

    // 3. Define the replacement code (No types, pure JS)
    const newFunction = `getIconPath(icon, filePath) {
        // For custom nodes, strip the base path to make it relative
        if (this.packageName === 'CUSTOM') {
            const relativePath = path.relative(this.directory, filePath);
            const iconPath = path.join(path.dirname(relativePath), icon.replace('file:', ''));
            return \`icons/\${this.packageName}/\${iconPath}\`;
        }
        
        // Original behavior for non-custom nodes
        const iconPath = path.join(path.dirname(filePath), icon.replace('file:', ''));
        return \`icons/\${this.packageName}/\${iconPath}\`;
    }`;

    // 4. Regex to match the existing function
    // We match the function signature and the final return statement
    const regex = /getIconPath\(icon, filePath\) \{[\s\S]*?return `icons\/\$\{this\.packageName\}\/\$\{iconPath\}`;\s*\}/;

    if (!regex.test(content)) {
        console.error('ERROR: Could not match the original getIconPath function code.');
        process.exit(1);
    }

    // 5. Apply patch
    const newContent = content.replace(regex, newFunction);
    fs.writeFileSync(filePath, newContent);
    console.log('Successfully patched directory-loader.js');

} catch (err) {
    console.error('Patch failed:', err);
    process.exit(1);
}

// Patch license-state.js to enable all features
try {
    console.log('\nSearching for license-state.js...');
    const licenseFilePath = execSync('find /usr/local/lib/node_modules/n8n -name license-state.js', { encoding: 'utf8' }).trim();
    
    if (!licenseFilePath) {
        console.error('ERROR: license-state.js not found');
        process.exit(1);
    }
    console.log('Found file at:', licenseFilePath);

    // Read content
    let licenseContent = fs.readFileSync(licenseFilePath, 'utf8');

    // List of methods to patch - add "true ||" before the return statement
    const methodsToPath = [
        'isCustomRolesLicensed',
        'isDynamicCredentialsLicensed',
        'isSharingLicensed',
        'isLogStreamingLicensed',
        'isLdapLicensed',
        'isSamlLicensed',
        'isOidcLicensed',
        'isMFAEnforcementLicensed',
        'isApiKeyScopesLicensed',
        'isAiAssistantLicensed',
        'isAskAiLicensed',
        'isAdvancedExecutionFiltersLicensed',
        'isAdvancedPermissionsLicensed',
        'isDebugInEditorLicensed',
        'isBinaryDataS3Licensed',
        'isMultiMainLicensed',
        'isVariablesLicensed',
        'isSourceControlLicensed',
        'isExternalSecretsLicensed',
        'isWorkerViewLicensed',
        'isProjectRoleAdminLicensed',
        'isProjectRoleEditorLicensed',
        'isProjectRoleViewerLicensed',
        'isCustomNpmRegistryLicensed',
        'isFoldersLicensed',
        'isInsightsSummaryLicensed',
        'isInsightsDashboardLicensed',
        'isInsightsHourlyDataLicensed',
        'isWorkflowDiffsLicensed',
        'isProvisioningLicensed'
    ];

    let patchedCount = 0;
    for (const method of methodsToPath) {
        // Match pattern: methodName() {\n        return this.isLicensed(...);\n    }
        const regex = new RegExp(`(${method}\\(\\)\\s*\\{\\s*return\\s+)(this\\.isLicensed\\([^)]+\\);)`, 'g');
        const newContent = licenseContent.replace(regex, '$1true || $2');
        if (newContent !== licenseContent) {
            licenseContent = newContent;
            patchedCount++;
        }
    }

    if (patchedCount === 0) {
        console.error('ERROR: Could not patch any license methods.');
        process.exit(1);
    }

    fs.writeFileSync(licenseFilePath, licenseContent);
    console.log(`Successfully patched license-state.js (${patchedCount} methods patched)`);

} catch (err) {
    console.error('License patch failed:', err);
    process.exit(1);
}

// Patch license.js to enable all features and inject entitlements
try {
    console.log('\nSearching for license.js...');
    const licenseJsPath = execSync('find /usr/local/lib/node_modules/n8n -name license.js | grep -v license-state.js | head -1', { encoding: 'utf8' }).trim();
    
    if (!licenseJsPath) {
        console.error('ERROR: license.js not found');
        process.exit(1);
    }
    console.log('Found file at:', licenseJsPath);

    // Read content
    let licenseJsContent = fs.readFileSync(licenseJsPath, 'utf8');

    // List of methods to patch in license.js - add "true ||" before the return statement
    const licenseJsMethods = [
        'isDynamicCredentialsEnabled',
        'isSharingEnabled',
        'isLogStreamingEnabled',
        'isLdapEnabled',
        'isSamlEnabled',
        'isApiKeyScopesEnabled',
        'isAiAssistantEnabled',
        'isAskAiEnabled',
        'isAiCreditsEnabled',
        'isAdvancedExecutionFiltersEnabled',
        'isAdvancedPermissionsLicensed',
        'isDebugInEditorLicensed',
        'isBinaryDataS3Licensed',
        'isMultiMainLicensed',
        'isVariablesEnabled',
        'isSourceControlLicensed',
        'isExternalSecretsEnabled',
        'isWorkerViewLicensed',
        'isProjectRoleAdminLicensed',
        'isProjectRoleEditorLicensed',
        'isProjectRoleViewerLicensed',
        'isCustomNpmRegistryEnabled',
        'isFoldersEnabled'
    ];

    let licenseJsPatchedCount = 0;
    for (const method of licenseJsMethods) {
        // Match pattern: methodName() {\n        return this.isLicensed(...);\n    }
        const regex = new RegExp(`(${method}\\(\\)\\s*\\{\\s*return\\s+)(this\\.isLicensed\\([^)]+\\);)`, 'g');
        const newContent = licenseJsContent.replace(regex, '$1true || $2');
        if (newContent !== licenseJsContent) {
            licenseJsContent = newContent;
            licenseJsPatchedCount++;
        }
    }

    // Patch getCurrentEntitlements to inject all features
    const allFeatures = {
        // Features
        'feat:sharing': true,
        'feat:ldap': true,
        'feat:saml': true,
        'feat:oidc': true,
        'feat:mfaEnforcement': true,
        'feat:logStreaming': true,
        'feat:advancedExecutionFilters': true,
        'feat:variables': true,
        'feat:sourceControl': true,
        'feat:externalSecrets': true,
        'feat:debugInEditor': true,
        'feat:binaryDataS3': true,
        'feat:multipleMainInstances': true,
        'feat:workerView': true,
        'feat:advancedPermissions': true,
        'feat:projectRole:admin': true,
        'feat:projectRole:editor': true,
        'feat:projectRole:viewer': true,
        'feat:aiAssistant': true,
        'feat:askAi': true,
        'feat:communityNodes:customRegistry': true,
        'feat:aiCredits': true,
        'feat:folders': true,
        'feat:insights:viewSummary': true,
        'feat:insights:viewDashboard': true,
        'feat:insights:viewHourlyData': true,
        'feat:apiKeyScopes': true,
        'feat:workflowDiffs': true,
        'feat:customRoles': true,
        'feat:aiBuilder': true,
        'feat:dynamicCredentials': true,
        'feat:workflowHistory': true,
        'feat:workflowHistoryPrune': true,
        // Quotas
        'quota:activeWorkflows': -1,
        'quota:maxVariables': -1,
        'quota:users': -1,
        'quota:workflowHistoryPrune': -1,
        'quota:maxTeamProjects': -1,
        'quota:insights:maxHistoryDays': 365,
        'quota:insights:retention:maxAgeDays': 365,
        'quota:insights:retention:pruneIntervalDays': 365,
        'quota:evaluations:maxWorkflows': -1,
        'planName': 'Enterprise'
    };

    const injectedFeatures = JSON.stringify(allFeatures);
    
    // Replace getCurrentEntitlements to merge injected features into the first entitlement
    const entitlementsRegex = /(getCurrentEntitlements\(\)\s*\{)\s*(return\s+this\.manager\?\.getCurrentEntitlements\(\)\s*\?\?\s*\[\];)/;
    if (entitlementsRegex.test(licenseJsContent)) {
        const newGetCurrentEntitlements = `$1
        const entitlements = this.manager?.getCurrentEntitlements() ?? [];
        const injectedFeatures = ${injectedFeatures};
        if (entitlements.length > 0) {
           entitlements[0].features = { ...entitlements[0].features, ...injectedFeatures };
        } else {
            entitlements.push({ features: injectedFeatures });
        }
        return entitlements;`;
        licenseJsContent = licenseJsContent.replace(entitlementsRegex, newGetCurrentEntitlements);
        licenseJsPatchedCount++;
        console.log('Patched getCurrentEntitlements to inject features into first entitlement');
    }

    // Patch isLicensed to always return true for any feature
    const isLicensedRegex = /(isLicensed\(feature\)\s*\{\s*return\s+)(this\.manager\?\.hasFeatureEnabled\(feature\)\s*\?\?\s*false)(;)/;
    if (isLicensedRegex.test(licenseJsContent)) {
        licenseJsContent = licenseJsContent.replace(
            isLicensedRegex,
            '$1true || ($2)$3'
        );
        licenseJsPatchedCount++;
        console.log('Patched isLicensed method');
    }

    if (licenseJsPatchedCount === 0) {
        console.error('ERROR: Could not patch any methods in license.js.');
        process.exit(1);
    }

    fs.writeFileSync(licenseJsPath, licenseJsContent);
    console.log(`Successfully patched license.js (${licenseJsPatchedCount} patches applied)`);

} catch (err) {
    console.error('License.js patch failed:', err);
    process.exit(1);
}