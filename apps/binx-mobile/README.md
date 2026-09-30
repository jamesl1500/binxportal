# binx-mobile

React Native (Expo) client for Binx Portal, currently focused on the client
portal experience.

## Get started

1. From the repo root, install dependencies (this is a pnpm workspace):

   ```bash
   pnpm install
   ```

2. Copy `.env.example` to `.env` and point `EXPO_PUBLIC_API_URL` at your
   running `binx-api`. **To test in Expo Go on a physical phone**, this must
   be your computer's LAN IP, not `localhost` — the phone can't resolve that
   to your machine. Phone and computer need to be on the same Wi-Fi network.

3. Start the app:

   ```bash
   pnpm start
   ```

   Scan the QR code with the Expo Go app (iOS/Android) to run it on your
   phone.

## Auth

`src/lib/api.ts` / `src/lib/auth.ts` / `src/contexts/auth-context.tsx` wire
the app up to binx-api's JWT auth (see `apps/binx-api/docs/AUTHENTICATION.md`):
access + refresh tokens are stored on-device via `expo-secure-store`, and a
401 transparently triggers a refresh-and-retry. `_layout.tsx` shows the login
screen until there's a valid session, then the normal tab navigator.

API types (`src/lib/api-schema.d.ts`) are generated from binx-api's OpenAPI
schema — regenerate after any API change:

```bash
pnpm --filter binx-mobile gen:api
```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
