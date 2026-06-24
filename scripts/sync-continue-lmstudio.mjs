#!/usr/bin/env node

import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const LABEL = "local.continue-lmstudio-sync";
const AUTO_MARKER = "lmstudio-sync: auto";
const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_CONTEXT_CAP = 32768;
const DEFAULT_TIMEOUT = 300000;

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

try {
  if (args.uninstallLaunchAgent) {
    await uninstallLaunchAgent();
  } else if (args.installLaunchAgent) {
    await installLaunchAgent();
    await syncContinueConfig();
  } else {
    await syncContinueConfig();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    baseUrl:
      process.env.LMSTUDIO_BASE_URL ??
      process.env.LMSTUDIO_API_BASE ??
      "http://127.0.0.1:1234",
    configPath:
      process.env.CONTINUE_CONFIG_PATH ??
      join(homedir(), ".continue", "config.yaml"),
    apiKey: process.env.LMSTUDIO_API_KEY ?? "lm-studio",
    apiToken: process.env.LMSTUDIO_API_TOKEN ?? "",
    contextCap: numberFromEnv("CONTINUE_LMSTUDIO_CONTEXT_CAP", DEFAULT_CONTEXT_CAP),
    maxTokens: numberFromEnv("CONTINUE_LMSTUDIO_MAX_TOKENS", 4096),
    interval: numberFromEnv("CONTINUE_LMSTUDIO_SYNC_INTERVAL", DEFAULT_INTERVAL_SECONDS),
    dryRun: false,
    quiet: false,
    installLaunchAgent: false,
    uninstallLaunchAgent: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (!argv[index]) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    switch (arg) {
      case "--base-url":
        parsed.baseUrl = next();
        break;
      case "--config":
        parsed.configPath = expandHome(next());
        break;
      case "--api-key":
        parsed.apiKey = next();
        break;
      case "--api-token":
        parsed.apiToken = next();
        break;
      case "--context-cap":
        parsed.contextCap = positiveInteger(next(), arg);
        break;
      case "--max-tokens":
        parsed.maxTokens = positiveInteger(next(), arg);
        break;
      case "--interval":
        parsed.interval = positiveInteger(next(), arg);
        break;
      case "--dry-run":
        parsed.dryRun = true;
        break;
      case "--quiet":
        parsed.quiet = true;
        break;
      case "--install-launch-agent":
        parsed.installLaunchAgent = true;
        break;
      case "--uninstall-launch-agent":
        parsed.uninstallLaunchAgent = true;
        break;
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  parsed.baseUrl = trimTrailingSlash(parsed.baseUrl);
  parsed.configPath = expandHome(parsed.configPath);
  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/sync-continue-lmstudio.mjs [options]

Sync downloaded LM Studio models into ~/.continue/config.yaml.

Options:
  --base-url URL              LM Studio base URL, default http://127.0.0.1:1234
  --config PATH               Continue config.yaml path
  --api-key KEY               API key Continue sends to LM Studio, default lm-studio
  --api-token TOKEN           Bearer token for LM Studio REST API, if enabled
  --context-cap TOKENS        Cap generated contextLength, default ${DEFAULT_CONTEXT_CAP}
  --max-tokens TOKENS         Generated maxTokens, default 4096
  --dry-run                   Print the resulting config without writing
  --quiet                     Only print errors
  --install-launch-agent      Install a macOS LaunchAgent that syncs every minute
  --uninstall-launch-agent    Remove the LaunchAgent
`);
}

async function syncContinueConfig() {
  const models = await fetchLmStudioModels();
  const llmCount = models.filter((model) => model.type === "llm").length;
  const embedCount = models.filter((model) => model.type === "embedding").length;

  if (!llmCount && !embedCount) {
    throw new Error("LM Studio returned no usable models.");
  }

  const currentConfig = existsSync(args.configPath)
    ? await readFile(args.configPath, "utf8")
    : defaultConfig();
  const nextConfig = buildNextConfig(currentConfig, models);

  if (args.dryRun) {
    process.stdout.write(nextConfig);
    return;
  }

  if (normalizeNewlines(currentConfig) === normalizeNewlines(nextConfig)) {
    log(`Continue config is already synced (${llmCount} LLM, ${embedCount} embedding).`);
    return;
  }

  await mkdir(dirname(args.configPath), { recursive: true });
  if (existsSync(args.configPath)) {
    const backupPath = `${args.configPath}.bak-${timestamp()}-lmstudio-sync`;
    await copyFile(args.configPath, backupPath);
    log(`Backup written: ${backupPath}`);
  }
  await writeFile(args.configPath, nextConfig, "utf8");
  log(`Synced ${llmCount} LLM and ${embedCount} embedding model(s) to ${args.configPath}.`);
}

async function fetchLmStudioModels() {
  const restUrl = `${args.baseUrl}/api/v1/models`;
  const restResponse = await fetchJson(restUrl);

  if (Array.isArray(restResponse?.models)) {
    return restResponse.models
      .filter((model) => model?.key && (model.type === "llm" || model.type === "embedding"))
      .map((model) => ({
        type: model.type,
        key: model.key,
        displayName: model.display_name || model.key,
        quantization: model.quantization?.name ?? "",
        params: model.params_string ?? "",
        maxContextLength: positiveNumber(model.max_context_length),
        loadedContextLength: positiveNumber(model.loaded_instances?.[0]?.config?.context_length),
        trainedForToolUse: Boolean(model.capabilities?.trained_for_tool_use),
        vision: Boolean(model.capabilities?.vision),
      }));
  }

  const openAiUrl = `${args.baseUrl}/v1/models`;
  const openAiResponse = await fetchJson(openAiUrl);
  const data = Array.isArray(openAiResponse?.data) ? openAiResponse.data : [];

  return data
    .filter((model) => model?.id)
    .map((model) => {
      const id = String(model.id);
      return {
        type: isEmbeddingId(id) ? "embedding" : "llm",
        key: id,
        displayName: id,
        quantization: "",
        params: "",
        maxContextLength: undefined,
        loadedContextLength: undefined,
        trainedForToolUse: false,
        vision: false,
      };
    });
}

async function fetchJson(url) {
  const headers = { Accept: "application/json" };
  if (args.apiToken) {
    headers.Authorization = `Bearer ${args.apiToken}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`LM Studio request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function buildNextConfig(currentConfig, models) {
  const parsed = parseExistingModels(currentConfig);
  const existingLmStudioByModel = new Map();
  const manualBlocks = [];

  for (const block of parsed.modelBlocks) {
    if (!block.isLmStudio) {
      manualBlocks.push(block.text);
      continue;
    }

    if (block.model && !block.isAutoGenerated) {
      existingLmStudioByModel.set(block.model, block.text);
    }
  }

  const generatedBlocks = models.map((model) => {
    return existingLmStudioByModel.get(model.key) ?? yamlForModel(model, models);
  });

  const modelItems = [...manualBlocks, ...generatedBlocks].filter(Boolean);
  const modelsBlock = ["models:", modelItems.join("\n\n")]
    .filter(Boolean)
    .join("\n");

  return replaceTopLevelBlock(currentConfig || defaultConfig(), "models", modelsBlock);
}

function parseExistingModels(configText) {
  const block = findTopLevelBlock(configText, "models");
  if (!block) {
    return { modelBlocks: [] };
  }

  const itemBlocks = [];
  let current = [];

  for (const line of block.bodyLines) {
    if (/^\s{2}-\s/.test(line) && current.length) {
      itemBlocks.push(current.join("\n").trimEnd());
      current = [line];
    } else if (line.trim() || current.length) {
      current.push(line);
    }
  }

  if (current.length) {
    itemBlocks.push(current.join("\n").trimEnd());
  }

  return {
    modelBlocks: itemBlocks.map((text) => {
      const provider = readYamlScalar(text, "provider");
      const apiBase = readYamlScalar(text, "apiBase");
      const model = readYamlScalar(text, "model");
      return {
        text,
        provider,
        apiBase,
        model,
        isAutoGenerated: text.includes(AUTO_MARKER),
        isLmStudio:
          provider === "lmstudio" ||
          /127\.0\.0\.1:1234|localhost:1234/.test(apiBase ?? ""),
      };
    }),
  };
}

function yamlForModel(model, allModels) {
  const duplicateDisplayNames = new Map();
  for (const candidate of allModels) {
    const displayName = candidate.displayName || candidate.key;
    duplicateDisplayNames.set(displayName, (duplicateDisplayNames.get(displayName) ?? 0) + 1);
  }

  const nameParts = [model.displayName || model.key];
  if (duplicateDisplayNames.get(model.displayName) > 1 && model.quantization) {
    nameParts.push(model.quantization);
  }
  if (model.params && !nameParts.join(" ").includes(model.params)) {
    nameParts.push(model.params);
  }

  const lines = [
    `  - name: ${yamlString(`${nameParts.join(" ")} (LM Studio)`)}`,
    `    # ${AUTO_MARKER}`,
    "    provider: openai",
    `    model: ${yamlString(model.key)}`,
    `    apiBase: ${yamlString(`${args.baseUrl}/v1`)}`,
    `    apiKey: ${yamlString(args.apiKey)}`,
  ];

  if (model.type === "embedding") {
    lines.push(
      "    roles:",
      "      - embed",
      "    embedOptions:",
      "      maxChunkSize: 512",
      "      maxBatchSize: 32",
      "    requestOptions:",
      `      timeout: ${DEFAULT_TIMEOUT}`,
    );
    return lines.join("\n");
  }

  const roles = ["chat", "edit", "apply"];
  if (isLikelyAutocompleteModel(model)) {
    roles.push("autocomplete");
  }

  lines.push("    roles:", ...roles.map((role) => `      - ${role}`));

  const capabilities = [];
  if (model.trainedForToolUse) {
    capabilities.push("tool_use");
  }
  if (model.vision) {
    capabilities.push("image_input");
  }
  if (capabilities.length) {
    lines.push("    capabilities:", ...capabilities.map((capability) => `      - ${capability}`));
  }

  lines.push(
    "    defaultCompletionOptions:",
    `      contextLength: ${contextLengthFor(model)}`,
    `      maxTokens: ${args.maxTokens}`,
    "      temperature: 0.2",
    "      topP: 0.9",
    "    requestOptions:",
    `      timeout: ${DEFAULT_TIMEOUT}`,
  );

  return lines.join("\n");
}

function isLikelyAutocompleteModel(model) {
  const value = `${model.key} ${model.displayName}`.toLowerCase();
  return /\b(coder|coding|code|fim)\b/.test(value);
}

function contextLengthFor(model) {
  const candidates = [
    model.loadedContextLength,
    model.maxContextLength,
    args.contextCap,
  ].filter((value) => Number.isFinite(value) && value > 0);

  if (!candidates.length) {
    return args.contextCap;
  }

  return Math.max(1024, Math.min(args.contextCap, ...candidates));
}

function replaceTopLevelBlock(configText, blockName, replacementBlock) {
  const normalized = normalizeNewlines(configText).trimEnd();
  const lines = normalized.split("\n");
  const block = findTopLevelBlock(normalized, blockName);

  if (!block) {
    const insertAt = Math.max(
      lines.findIndex((line) => /^schema:\s*/.test(line)) + 1,
      lines.findIndex((line) => /^version:\s*/.test(line)) + 1,
      lines.length,
    );
    const nextLines = [
      ...lines.slice(0, insertAt),
      "",
      ...replacementBlock.split("\n"),
      "",
      ...lines.slice(insertAt),
    ];
    return `${collapseBlankLines(nextLines).join("\n").trimEnd()}\n`;
  }

  const nextLines = [
    ...lines.slice(0, block.start),
    ...replacementBlock.split("\n"),
    "",
    ...lines.slice(block.end),
  ];
  return `${collapseBlankLines(nextLines).join("\n").trimEnd()}\n`;
}

function findTopLevelBlock(configText, blockName) {
  const lines = normalizeNewlines(configText).split("\n");
  const start = lines.findIndex((line) => line.trim() === `${blockName}:` && !/^\s/.test(line));
  if (start === -1) {
    return undefined;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[A-Za-z0-9_-]+:\s*/.test(lines[index])) {
      end = index;
      break;
    }
  }

  return {
    start,
    end,
    bodyLines: lines.slice(start + 1, end),
  };
}

function readYamlScalar(blockText, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = blockText.match(new RegExp(`^\\s+${escapedKey}:\\s*(.+?)\\s*$`, "m"));
  if (!match) {
    return undefined;
  }
  return unquoteYamlScalar(match[1].trim());
}

function unquoteYamlScalar(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value.replace(/\s+#.*$/, "");
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function collapseBlankLines(lines) {
  const result = [];
  for (const line of lines) {
    const previous = result[result.length - 1];
    if (line === "" && previous === "") {
      continue;
    }
    result.push(line);
  }
  return result;
}

function defaultConfig() {
  return `name: Local LM Studio
version: 1.0.0
schema: v1

models: []

context:
  - provider: file
  - provider: code
  - provider: diff
  - provider: terminal
`;
}

async function installLaunchAgent() {
  const sourceScript = fileURLToPath(import.meta.url);
  const targetDir = join(homedir(), ".continue", "bin");
  const targetScript = join(targetDir, "sync-continue-lmstudio.mjs");
  const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
  const plistPath = join(launchAgentsDir, `${LABEL}.plist`);
  const logPath = join(homedir(), ".continue", "lmstudio-sync.log");
  const errorLogPath = join(homedir(), ".continue", "lmstudio-sync.err.log");

  await mkdir(targetDir, { recursive: true });
  await mkdir(launchAgentsDir, { recursive: true });
  await copyFile(sourceScript, targetScript);
  await chmod(targetScript, 0o755);

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${targetScript}</string>
    <string>--quiet</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>${args.interval}</integer>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${errorLogPath}</string>
</dict>
</plist>
`;

  await writeFile(plistPath, plist, "utf8");
  launchctl(["bootout", `gui/${process.getuid()}`, plistPath], { allowFailure: true });
  launchctl(["bootstrap", `gui/${process.getuid()}`, plistPath]);
  launchctl(["kickstart", "-k", `gui/${process.getuid()}/${LABEL}`], { allowFailure: true });
  log(`LaunchAgent installed: ${plistPath}`);
}

async function uninstallLaunchAgent() {
  const plistPath = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
  launchctl(["bootout", `gui/${process.getuid()}`, plistPath], { allowFailure: true });
  await rm(plistPath, { force: true });
  log(`LaunchAgent removed: ${plistPath}`);
}

function launchctl(argv, options = {}) {
  const result = spawnSync("launchctl", argv, {
    encoding: "utf8",
    stdio: args.quiet ? "pipe" : "inherit",
  });

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`launchctl ${argv.join(" ")} failed: ${result.stderr || result.status}`);
  }
}

function expandHome(value) {
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }
  return value;
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function numberFromEnv(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  return positiveInteger(value, name);
}

function positiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n");
}

function isEmbeddingId(id) {
  return /(^|[-_/])(embed|embedding|bge|e5|nomic)([-_/]|$)/i.test(id);
}

function log(message) {
  if (!args.quiet) {
    console.log(message);
  }
}
