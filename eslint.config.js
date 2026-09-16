import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["evm/out/**", "evm/cache/**", "node_modules/**", "dist/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
);
