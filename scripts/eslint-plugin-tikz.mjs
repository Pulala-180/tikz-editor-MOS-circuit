const coordinateTypeNames = new Set([
  "AnchorLocalPoint",
  "ArrowLocalPoint",
  "ClientBounds",
  "ClientPoint",
  "ClientVector",
  "FrameLocalPoint",
  "FrameLocalVector",
  "SourceCmPoint",
  "SvgBounds",
  "SvgPoint",
  "SvgVector",
  "TextareaLocalPoint",
  "TextRectLocalPoint",
  "ViewportBounds",
  "ViewportPoint",
  "ViewportVector",
  "WorldBounds",
  "WorldPoint",
  "WorldVector"
]);

const coordinateFactoryFiles = [
  "/packages/core/src/coords/points.ts",
  "/packages/core/src/coords/scalars.ts"
];

function isCoordinateFactoryFile(filename) {
  return coordinateFactoryFiles.some((suffix) => filename.endsWith(suffix));
}

function hasProperty(node, name) {
  return node.properties.some((property) => {
    if (property.type !== "Property") return false;
    if (property.key.type === "Identifier") return property.key.name === name;
    if (property.key.type === "Literal") return property.key.value === name;
    return false;
  });
}

function isXyObjectExpression(node) {
  return node?.type === "ObjectExpression" && hasProperty(node, "x") && hasProperty(node, "y");
}

function typeNameFromAnnotation(annotation) {
  if (!annotation) return null;
  if (annotation.type === "TSTypeReference" && annotation.typeName.type === "Identifier") {
    return annotation.typeName.name;
  }
  if (annotation.type === "TSTypeAnnotation") {
    return typeNameFromAnnotation(annotation.typeAnnotation);
  }
  return null;
}

function containsCoordinateType(annotation) {
  const directName = typeNameFromAnnotation(annotation);
  if (directName && coordinateTypeNames.has(directName)) return true;

  if (!annotation || typeof annotation !== "object") return false;

  switch (annotation.type) {
    case "TSArrayType":
      return containsCoordinateType(annotation.elementType);
    case "TSIndexedAccessType":
      return containsCoordinateType(annotation.objectType) || containsCoordinateType(annotation.indexType);
    case "TSIntersectionType":
    case "TSUnionType":
      return annotation.types.some((type) => containsCoordinateType(type));
    case "TSTypeAnnotation":
      return containsCoordinateType(annotation.typeAnnotation);
    case "TSTypeLiteral":
      return annotation.members.some((member) => containsCoordinateType(member.typeAnnotation));
    case "TSTypeOperator":
      return containsCoordinateType(annotation.typeAnnotation);
    case "TSTupleType":
      return annotation.elementTypes.some((type) => containsCoordinateType(type));
    case "TSTypeReference":
      return annotation.typeArguments?.params.some((type) => containsCoordinateType(type)) ?? false;
    default:
      return false;
  }
}

function functionReturnType(node) {
  return node.returnType ?? node.parent?.returnType ?? null;
}

const noCoordinateTypeCast = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow casting values to branded coordinate types outside coordinate factories"
    },
    messages: {
      noCoordinateCast: "Use a coordinate constructor/conversion helper instead of casting to a branded coordinate type."
    },
    schema: []
  },
  create(context) {
    if (isCoordinateFactoryFile(context.filename)) {
      return {};
    }

    return {
      TSAsExpression(node) {
        if (containsCoordinateType(node.typeAnnotation)) {
          context.report({ node, messageId: "noCoordinateCast" });
          return;
        }

        if (isXyObjectExpression(node.expression) && node.typeAnnotation.type === "TSTypeQuery") {
          context.report({ node, messageId: "noCoordinateCast" });
        }
      },
      TSTypeAssertion(node) {
        if (containsCoordinateType(node.typeAnnotation)) {
          context.report({ node, messageId: "noCoordinateCast" });
        }
      }
    };
  }
};

const noRawCoordinateObject = {
  meta: {
    type: "problem",
    docs: {
      description: "require branded coordinate constructors instead of raw x/y object literals"
    },
    messages: {
      noRawCoordinateObject: "Use the typed coordinate constructor for this branded coordinate object."
    },
    schema: []
  },
  create(context) {
    if (isCoordinateFactoryFile(context.filename)) {
      return {};
    }

    return {
      VariableDeclarator(node) {
        if (
          node.id.type === "Identifier" &&
          containsCoordinateType(node.id.typeAnnotation) &&
          isXyObjectExpression(node.init)
        ) {
          context.report({ node: node.init, messageId: "noRawCoordinateObject" });
        }
      },
      PropertyDefinition(node) {
        if (containsCoordinateType(node.typeAnnotation) && isXyObjectExpression(node.value)) {
          context.report({ node: node.value, messageId: "noRawCoordinateObject" });
        }
      },
      ReturnStatement(node) {
        if (!isXyObjectExpression(node.argument)) return;

        const ancestors = context.sourceCode.getAncestors(node);
        const owner = ancestors.findLast((ancestor) =>
          ancestor.type === "FunctionDeclaration" ||
          ancestor.type === "FunctionExpression" ||
          ancestor.type === "ArrowFunctionExpression"
        );

        if (owner && containsCoordinateType(functionReturnType(owner))) {
          context.report({ node: node.argument, messageId: "noRawCoordinateObject" });
        }
      }
    };
  }
};

function jsxAttributeName(node) {
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXNamespacedName") {
    return `${node.namespace.name}:${node.name.name}`;
  }
  return null;
}

const jsxNoDuplicateProps = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow duplicate JSX props on the same element"
    },
    messages: {
      duplicateProp: "Prop '{{name}}' is specified more than once on this JSX element."
    },
    schema: []
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const seen = new Set();

        for (const attribute of node.attributes) {
          if (attribute.type !== "JSXAttribute") continue;

          const name = jsxAttributeName(attribute.name);
          if (!name) continue;

          if (seen.has(name)) {
            context.report({
              node: attribute.name,
              messageId: "duplicateProp",
              data: { name }
            });
            continue;
          }

          seen.add(name);
        }
      }
    };
  }
};

export default {
  rules: {
    "no-coordinate-type-cast": noCoordinateTypeCast,
    "no-raw-coordinate-object": noRawCoordinateObject,
    "jsx-no-duplicate-props": jsxNoDuplicateProps
  }
};
