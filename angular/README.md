# TeamkompassAngular

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.24.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Abhängigkeiten und `npm audit` (SCRUM-56)

Stand 2026-10-06: `piscina` (kritisch, Build-Tooling über `@angular/build`) und `http-cache-semantics`
sind per `npm audit fix` auf gepatchte Versionen im Lockfile angehoben (keine Major-Wechsel). Ein
Test in `tests/project.test.mjs` verhindert, dass `piscina` im Lockfile wieder auf eine betroffene
Version (5.0.0 bis 5.3.1) zurückfällt.

**Akzeptierte Ausnahme: `@grpc/grpc-js` (4 hohe Meldungen, Pfad `firebase` → `@firebase/firestore`).**
- Beide Advisories (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4) betreffen den gRPC-**Server**
  (`getAuthContext`, Fehlertexte von Server-Handlern). TeamKompass betreibt keinen gRPC-Server.
- Im Produktions-Bundle ist `@grpc/grpc-js` nicht enthalten (Browser-Build von Firestore nutzt
  WebChannel/Fetch); im gebauten Bundle kommt nur der Optionsname `grpcFlowControlWindow` vor.
- Die Abhängigkeit ist in der aktuellen Firebase-Version (12.19.0) per `~1.9.0` festgenagelt; der von
  npm vorgeschlagene Fix (`firebase@9.14.0`) wäre ein Major-Downgrade und wird bewusst nicht angewendet.
- Neu bewerten, sobald eine neue Firebase-Version `@grpc/grpc-js` ≥ 1.13.6 erlaubt.
