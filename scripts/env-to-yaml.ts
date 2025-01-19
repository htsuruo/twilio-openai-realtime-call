// ref. https://zenn.dev/nbstsh/scraps/5c5a97ab1c7cd3

import * as fs from 'fs'

// Check if the input file was provided
if (process.argv.length <= 2) {
  console.warn('Please provide the path to the .env file')
  process.exit(1)
}

// Input .env file
const envFile = process.argv[2]

// Convert the .env file to a YAML file
//  - .env => .env.yaml
//  - .env.local => .env.local.yaml
//  - .env.development => .env.development.yaml
const yamlFile = `${envFile}.yaml`

// Read the content of the .env file
const envFileContent = fs.readFileSync(envFile, 'utf-8')

// Convert the .env content to a YAML format
const envYamlContent = envFileContent
  .split(/\r?\n/)
  .map((line) => {
    // Skip empty lines and lines that start with a hash (#)
    if (line.trim() === '' || line.trim().startsWith('#')) {
      return
    }

    const [key, value] = line.split('=')
    if (!isNaN(Number(value))) {
      return `${key}: "${value}"`
    }

    return line.replace('=', ': ')
  })
  .filter(Boolean)
  .join('\n')

// Write the YAML content to the output file
fs.writeFileSync(yamlFile, envYamlContent, 'utf-8')
console.log(`YAML file created at: ${yamlFile}`)
