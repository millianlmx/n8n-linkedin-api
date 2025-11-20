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