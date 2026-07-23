import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const plantsDirectory = path.join(repositoryRoot, "plants");
const schemaPath = path.join(repositoryRoot, "schema", "plant.schema.json");

async function findJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return findJsonFiles(entryPath);
      }

      return entry.isFile() && path.extname(entry.name).toLowerCase() === ".json"
        ? [entryPath]
        : [];
    }),
  );

  return files.flat().sort();
}

const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);
const jsonFiles = await findJsonFiles(plantsDirectory);
let hasErrors = false;
const parsedPlants = [];

for (const filePath of jsonFiles) {
  const relativePath = path.relative(repositoryRoot, filePath);

  try {
    const plant = JSON.parse(await readFile(filePath, "utf8"));

    if (!validate(plant)) {
      hasErrors = true;
      console.error(`\n${relativePath}`);
      for (const error of validate.errors ?? []) {
        console.error(`  ${error.instancePath || "/"} ${error.message}`);
      }
    } else {
      parsedPlants.push({ filePath, plant });
    }
  } catch (error) {
    hasErrors = true;
    console.error(`\n${relativePath}`);
    console.error(`  ${error.message}`);
  }
}

const registeredPlantIds = new Set(
  parsedPlants
    .map(({ plant }) => plant.id)
    .filter((id) => typeof id === "string" && id.length > 0),
);
const unresolvedReferences = [];

function checkPlantReference(filePath, referencePath, targetId) {
  if (!registeredPlantIds.has(targetId)) {
    unresolvedReferences.push({ filePath, referencePath, targetId });
  }
}

for (const { filePath, plant } of parsedPlants) {
  for (const [index, relationship] of (plant.relationships ?? []).entries()) {
    checkPlantReference(
      filePath,
      `/relationships/${index}/targetPlantId`,
      relationship.targetPlantId,
    );
  }

  for (const [methodIndex, method] of (plant.pruning?.methods ?? []).entries()) {
    if (typeof method === "string") {
      continue;
    }

    for (const [targetIndex, target] of (method.appliesTo ?? []).entries()) {
      checkPlantReference(
        filePath,
        `/pruning/methods/${methodIndex}/appliesTo/${targetIndex}/targetId`,
        target.targetId,
      );
    }
  }

  for (const [diagramIndex, diagram] of (plant.diagrams ?? []).entries()) {
    for (const [targetIndex, target] of (diagram.appliesTo ?? []).entries()) {
      checkPlantReference(
        filePath,
        `/diagrams/${diagramIndex}/appliesTo/${targetIndex}/targetId`,
        target.targetId,
      );
    }
  }
}

for (const { filePath, referencePath, targetId } of unresolvedReferences) {
  console.warn(
    `警告: ${path.relative(repositoryRoot, filePath)} ${referencePath} は未登録の植物ID "${targetId}" を参照しています。`,
  );
}

if (hasErrors) {
  console.error("\n検証に失敗しました。");
  process.exitCode = 1;
} else {
  console.log(`${jsonFiles.length}件の植物JSONを検証しました。すべて正常です。`);
}
