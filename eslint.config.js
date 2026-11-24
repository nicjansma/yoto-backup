import globals from "globals";
import nicjansma from "eslint-config-nicjansma/flat";

export default [
    {
        ignores: [
            "node_modules/**"
        ]
    },
    nicjansma,
    {
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.node
            }
        },
        rules: {
            // Disabled over nicjansma
            "no-process-exit": 0,
            "guard-for-in": 0
        }
    }
];
