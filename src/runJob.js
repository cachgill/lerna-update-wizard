const fs = require("fs-extra");
const modifyPackageJson = require("./utils/modifyPackageJson");
const ui = require("./utils/ui");
const chalk = require("chalk");
const inquirer = require("inquirer");
const path = require("path");
const composeCommand = require("./utils/composeCommand");
const runCommand = require("./utils/runCommand");
const lines = require("./utils/lines");

const { resolve } = path;

let totalInstalls = 0;

const runJob = async (job, context) => {
  const {
    targetDependency,
    targetPackages,
    targetVersion,
    targetVersionResolved,
  } = job;

  const { dependencyMap, flags, packages, dependencyManager } = context;

  ui.log.write("\n");

  for (let targetPackageName of targetPackages) {
    const existingDependency = dependencyMap[targetDependency];

    let source = "dependencies";

    if (existingDependency && existingDependency.packs[targetPackageName]) {
      const { version, source: theSource } =
        existingDependency.packs[targetPackageName] || {};

      source = theSource;

      if (version === targetVersion) {
        ui.log.write(
          lines(
            chalk`{bold ${targetPackageName}:}`,
            `  ${targetDependency}@${targetVersion}`,
            chalk`  {yellow Already installed ✗}`,
            "\n"
          )
        );
        continue;
      }
    } else if (!flags.newInstallsMode) {
      const { targetSource } = await inquirer.prompt([
        {
          type: "list",
          name: "targetSource",
          message: lines(
            `Select installation type for new dependency`,
            "",
            chalk`  {reset ${targetPackageName}}`,
            chalk`  {reset.green + ${targetDependency} ${targetVersionResolved}}`,
            ""
          ),
          pageSize: 3,
          choices: [
            { name: "dependencies" },
            { name: "devDependencies" },
            { name: "peerDependencies" },
          ].filter(Boolean),
        },
      ]);

      source = targetSource;
    } else {
      source = {
        prod: "dependencies",
        dev: "devDependencies",
        peer: "peerDependencies",
      }[flags.newInstallsMode];
    }

    const { path: packageDir } = packages.find(
      ({ config: { name } }) => name === targetPackageName
    );

    const sourceParam = {
      yarn: {
        devDependencies: "--dev",
        peerDependencies: "--peer",
      },
      npm: {
        dependencies: "--save",
        devDependencies: "--save-dev",
      },
    }[dependencyManager][source || "dependencies"];

    if (
      // If we're running in lazy mode
      flags.lazy ||
      // Or if we're dealing with a peer dependency via npm
      (source === "peerDependencies" && dependencyManager === "npm")
    ) {
      const packageJsonPath = resolve(packageDir, "package.json");

      fs.writeFileSync(
        packageJsonPath,
        modifyPackageJson(packageJsonPath, {
          [source]: { [targetDependency]: targetVersionResolved },
        })
      );

      ui.log.write(
        lines(
          chalk`{bold ${targetPackageName}:}`,
          `  ${targetDependency}@${targetVersion}`,
          chalk`  {green package.json updated ✓}`,
          "\n"
        )
      );
    } else {
      const installCmd =
        dependencyManager === "yarn"
          ? composeCommand(
              "yarn",
              "add",
              sourceParam,
              flags.installArgs,
              `${targetDependency}@${targetVersion}`
            )
          : composeCommand(
              "npm",
              "install",
              sourceParam,
              flags.installArgs,
              `${targetDependency}@${targetVersion}`
            );

      await runCommand(`cd ${packageDir} && ${installCmd}`, {
        startMessage: `${chalk.white.bold(targetPackageName)}: ${installCmd}`,
        endMessage: chalk.green(`${targetPackageName} ✓`),
        logTime: true,
      });
    }

    totalInstalls++;
  }
  return totalInstalls;
};

module.exports = runJob;
