'use strict';

const fs = require('fs');
const postcssLess = require('postcss-less');

const _ = require('lodash');
const declarationValueIndex = require('../../utils/declarationValueIndex');
const getDeclarationValue = require('../../utils/getDeclarationValue');
const postcss = require('postcss');
const report = require('../../utils/report');
const ruleMessages = require('../../utils/ruleMessages');
const setDeclarationValue = require('../../utils/setDeclarationValue');
const validateOptions = require('../../utils/validateOptions');

const ruleName = 'global-variables';
const IGNORED_PROPS = ['width', 'height', 'margin', 'padding'];

const getVariablesDict = (path) => {
	try {
		const allVariables = fs.readFileSync(path, 'utf8');

		const root = postcssLess.parse(allVariables);

		if (!root) return undefined;

		const aTrules = root.nodes.filter(
			({ type, variable }) => type === 'atrule' && Boolean(variable),
		);

		return aTrules.reduce((dict, { name, value }) => ((dict[value] = name), dict), {});
	} catch (e) {
		return undefined;
	}
};

const isIgnoredProp = (propName) => {
	return IGNORED_PROPS.some((prop) => new RegExp(prop).test(propName));
};

const messages = ruleMessages(ruleName, {
	expected: (actual, expected) => `Expected "${actual}" to be "${expected}"`,
});

const addImportVariables = (root, variablesPath) => {
	const hasImport = root.nodes.some((node) => {
		return (
			node.type === 'atrule' &&
			Boolean(node.import) &&
			node.filename &&
			variablesPath.includes(node.filename.replace(/\{|\}|"/gi, ''))
		);
	});

	if (hasImport) return;

	const importPath = `{}${variablesPath.replace('.less', '').replace('.', '')}`;

	root.nodes.unshift(postcss.parse(`@import (reference) "${importPath}"; \r\n`));
};

function rule(variablesPath, partialOptions, context) {
	return (root, result) => {
		const validOptions = validateOptions(result, ruleName, {
			actual: variablesPath,
			possible: _.isString,
		});

		if (!validOptions) return;

		const variables = getVariablesDict(variablesPath);

		if (!variables) return;

		const canFix = !partialOptions || partialOptions.fixible !== false;

		let variablesImported = false;

		root.walkDecls((decl) => {
			const value = getDeclarationValue(decl);
			const variable = variables[value] ? `@${variables[value]}` : undefined;

			if (!variable || isIgnoredProp(decl.prop)) return;

			if (context.fix && canFix) {
				if (!variablesImported) {
					addImportVariables(root, variablesPath);
					variablesImported = true;
				}

				setDeclarationValue(decl, variable);

				return;
			}

			report({
				message: messages.expected(value, variable),
				node: decl,
				index: declarationValueIndex(decl),
				result,
				ruleName,
			});
		});
	};
}

rule.ruleName = ruleName;
rule.messages = messages;
module.exports = rule;
