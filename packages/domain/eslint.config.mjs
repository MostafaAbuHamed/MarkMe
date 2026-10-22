import base from "@markme/config/eslint";

export default [
  ...base,
  {
    files: ["src/**/*.ts"],
    ignores: ["src/client/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              message: "Only src/client may import supabase-js (A31).",
            },
          ],
        },
      ],
    },
  },
];
