import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const plantsDirectory = path.join(repositoryRoot, "plants");
const branchTypesDirectory = path.join(repositoryRoot, "branch-types");
const plantSchemaPath = path.join(
  repositoryRoot,
  "schema",
  "plant.schema.json",
);
const branchTypeSchemaPath = path.join(
  repositoryRoot,
  "schema",
  "branch-type.schema.json",
);

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

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const plantSchema = JSON.parse(await readFile(plantSchemaPath, "utf8"));
const branchTypeSchema = JSON.parse(
  await readFile(branchTypeSchemaPath, "utf8"),
);
const validatePlant = ajv.compile(plantSchema);
const validateBranchType = ajv.compile(branchTypeSchema);
const plantJsonFiles = await findJsonFiles(plantsDirectory);
const branchTypeJsonFiles = await findJsonFiles(branchTypesDirectory);
let hasErrors = false;
const parsedPlants = [];

for (const filePath of plantJsonFiles) {
  const relativePath = path.relative(repositoryRoot, filePath);

  try {
    const plant = JSON.parse(await readFile(filePath, "utf8"));

    if (!validatePlant(plant)) {
      hasErrors = true;
      console.error(`\n${relativePath}`);
      for (const error of validatePlant.errors ?? []) {
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

const parsedBranchTypes = [];

for (const filePath of branchTypeJsonFiles) {
  const relativePath = path.relative(repositoryRoot, filePath);

  try {
    const branchType = JSON.parse(await readFile(filePath, "utf8"));

    if (!validateBranchType(branchType)) {
      hasErrors = true;
      console.error(`\n${relativePath}`);
      for (const error of validateBranchType.errors ?? []) {
        console.error(`  ${error.instancePath || "/"} ${error.message}`);
      }
    } else {
      parsedBranchTypes.push({ filePath, branchType });
    }
  } catch (error) {
    hasErrors = true;
    console.error(`\n${relativePath}`);
    console.error(`  ${error.message}`);
  }
}

const duplicateValues = [];

function collectDuplicates(items, field) {
  const seen = new Map();

  for (const { filePath, branchType } of items) {
    const value = branchType[field];
    if (seen.has(value)) {
      duplicateValues.push({
        field,
        value,
        files: [seen.get(value), filePath],
      });
    } else {
      seen.set(value, filePath);
    }
  }
}

collectDuplicates(parsedBranchTypes, "id");
collectDuplicates(parsedBranchTypes, "slug");

for (const { field, value, files } of duplicateValues) {
  hasErrors = true;
  console.error(
    `\n重複: ${field} "${value}" (${files
      .map((filePath) => path.relative(repositoryRoot, filePath))
      .join(", ")})`,
  );
}

for (const { filePath, branchType } of parsedBranchTypes) {
  const expectedFileName = `${branchType.slug}.json`;
  if (path.basename(filePath) !== expectedFileName) {
    hasErrors = true;
    console.error(
      `\n${path.relative(repositoryRoot, filePath)} ファイル名は "${expectedFileName}" と一致する必要があります。`,
    );
  }

  if (branchType.id !== branchType.slug) {
    hasErrors = true;
    console.error(
      `\n${path.relative(repositoryRoot, filePath)} id と slug は一致する必要があります。`,
    );
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
  console.log(
    `${plantJsonFiles.length}件の植物JSONと${branchTypeJsonFiles.length}件の忌み枝JSONを検証しました。すべて正常です。`,
  );
}
