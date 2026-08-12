/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/api/cron/poll-oem/route";
exports.ids = ["app/api/cron/poll-oem/route"];
exports.modules = {

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ }),

/***/ "../app-render/work-async-storage.external":
/*!*****************************************************************************!*\
  !*** external "next/dist/server/app-render/work-async-storage.external.js" ***!
  \*****************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/server/app-render/work-async-storage.external.js");

/***/ }),

/***/ "./work-unit-async-storage.external":
/*!**********************************************************************************!*\
  !*** external "next/dist/server/app-render/work-unit-async-storage.external.js" ***!
  \**********************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/server/app-render/work-unit-async-storage.external.js");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fcron%2Fpoll-oem%2Froute&page=%2Fapi%2Fcron%2Fpoll-oem%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fcron%2Fpoll-oem%2Froute.ts&appDir=%2FUsers%2Fraahilmehta%2FDesktop%2Fsolarassistprod%2Ffrontend%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fraahilmehta%2FDesktop%2Fsolarassistprod%2Ffrontend&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!*********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fcron%2Fpoll-oem%2Froute&page=%2Fapi%2Fcron%2Fpoll-oem%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fcron%2Fpoll-oem%2Froute.ts&appDir=%2FUsers%2Fraahilmehta%2FDesktop%2Fsolarassistprod%2Ffrontend%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fraahilmehta%2FDesktop%2Fsolarassistprod%2Ffrontend&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \*********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   workAsyncStorage: () => (/* binding */ workAsyncStorage),\n/* harmony export */   workUnitAsyncStorage: () => (/* binding */ workUnitAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/route-kind */ \"(rsc)/./node_modules/next/dist/server/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _Users_raahilmehta_Desktop_solarassistprod_frontend_app_api_cron_poll_oem_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/cron/poll-oem/route.ts */ \"(rsc)/./app/api/cron/poll-oem/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/cron/poll-oem/route\",\n        pathname: \"/api/cron/poll-oem\",\n        filename: \"route\",\n        bundlePath: \"app/api/cron/poll-oem/route\"\n    },\n    resolvedPagePath: \"/Users/raahilmehta/Desktop/solarassistprod/frontend/app/api/cron/poll-oem/route.ts\",\n    nextConfigOutput,\n    userland: _Users_raahilmehta_Desktop_solarassistprod_frontend_app_api_cron_poll_oem_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule;\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        workAsyncStorage,\n        workUnitAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIvaW5kZXguanM/bmFtZT1hcHAlMkZhcGklMkZjcm9uJTJGcG9sbC1vZW0lMkZyb3V0ZSZwYWdlPSUyRmFwaSUyRmNyb24lMkZwb2xsLW9lbSUyRnJvdXRlJmFwcFBhdGhzPSZwYWdlUGF0aD1wcml2YXRlLW5leHQtYXBwLWRpciUyRmFwaSUyRmNyb24lMkZwb2xsLW9lbSUyRnJvdXRlLnRzJmFwcERpcj0lMkZVc2VycyUyRnJhYWhpbG1laHRhJTJGRGVza3RvcCUyRnNvbGFyYXNzaXN0cHJvZCUyRmZyb250ZW5kJTJGYXBwJnBhZ2VFeHRlbnNpb25zPXRzeCZwYWdlRXh0ZW5zaW9ucz10cyZwYWdlRXh0ZW5zaW9ucz1qc3gmcGFnZUV4dGVuc2lvbnM9anMmcm9vdERpcj0lMkZVc2VycyUyRnJhYWhpbG1laHRhJTJGRGVza3RvcCUyRnNvbGFyYXNzaXN0cHJvZCUyRmZyb250ZW5kJmlzRGV2PXRydWUmdHNjb25maWdQYXRoPXRzY29uZmlnLmpzb24mYmFzZVBhdGg9JmFzc2V0UHJlZml4PSZuZXh0Q29uZmlnT3V0cHV0PSZwcmVmZXJyZWRSZWdpb249Jm1pZGRsZXdhcmVDb25maWc9ZTMwJTNEISIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7OztBQUErRjtBQUN2QztBQUNxQjtBQUNrQztBQUMvRztBQUNBO0FBQ0E7QUFDQSx3QkFBd0IseUdBQW1CO0FBQzNDO0FBQ0EsY0FBYyxrRUFBUztBQUN2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0EsWUFBWTtBQUNaLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQSxRQUFRLHNEQUFzRDtBQUM5RDtBQUNBLFdBQVcsNEVBQVc7QUFDdEI7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUMwRjs7QUFFMUYiLCJzb3VyY2VzIjpbIiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvcm91dGUtbW9kdWxlcy9hcHAtcm91dGUvbW9kdWxlLmNvbXBpbGVkXCI7XG5pbXBvcnQgeyBSb3V0ZUtpbmQgfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiL1VzZXJzL3JhYWhpbG1laHRhL0Rlc2t0b3Avc29sYXJhc3Npc3Rwcm9kL2Zyb250ZW5kL2FwcC9hcGkvY3Jvbi9wb2xsLW9lbS9yb3V0ZS50c1wiO1xuLy8gV2UgaW5qZWN0IHRoZSBuZXh0Q29uZmlnT3V0cHV0IGhlcmUgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZW0gaW4gdGhlIHJvdXRlXG4vLyBtb2R1bGUuXG5jb25zdCBuZXh0Q29uZmlnT3V0cHV0ID0gXCJcIlxuY29uc3Qgcm91dGVNb2R1bGUgPSBuZXcgQXBwUm91dGVSb3V0ZU1vZHVsZSh7XG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgICBraW5kOiBSb3V0ZUtpbmQuQVBQX1JPVVRFLFxuICAgICAgICBwYWdlOiBcIi9hcGkvY3Jvbi9wb2xsLW9lbS9yb3V0ZVwiLFxuICAgICAgICBwYXRobmFtZTogXCIvYXBpL2Nyb24vcG9sbC1vZW1cIixcbiAgICAgICAgZmlsZW5hbWU6IFwicm91dGVcIixcbiAgICAgICAgYnVuZGxlUGF0aDogXCJhcHAvYXBpL2Nyb24vcG9sbC1vZW0vcm91dGVcIlxuICAgIH0sXG4gICAgcmVzb2x2ZWRQYWdlUGF0aDogXCIvVXNlcnMvcmFhaGlsbWVodGEvRGVza3RvcC9zb2xhcmFzc2lzdHByb2QvZnJvbnRlbmQvYXBwL2FwaS9jcm9uL3BvbGwtb2VtL3JvdXRlLnRzXCIsXG4gICAgbmV4dENvbmZpZ091dHB1dCxcbiAgICB1c2VybGFuZFxufSk7XG4vLyBQdWxsIG91dCB0aGUgZXhwb3J0cyB0aGF0IHdlIG5lZWQgdG8gZXhwb3NlIGZyb20gdGhlIG1vZHVsZS4gVGhpcyBzaG91bGRcbi8vIGJlIGVsaW1pbmF0ZWQgd2hlbiB3ZSd2ZSBtb3ZlZCB0aGUgb3RoZXIgcm91dGVzIHRvIHRoZSBuZXcgZm9ybWF0LiBUaGVzZVxuLy8gYXJlIHVzZWQgdG8gaG9vayBpbnRvIHRoZSByb3V0ZS5cbmNvbnN0IHsgd29ya0FzeW5jU3RvcmFnZSwgd29ya1VuaXRBc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzIH0gPSByb3V0ZU1vZHVsZTtcbmZ1bmN0aW9uIHBhdGNoRmV0Y2goKSB7XG4gICAgcmV0dXJuIF9wYXRjaEZldGNoKHtcbiAgICAgICAgd29ya0FzeW5jU3RvcmFnZSxcbiAgICAgICAgd29ya1VuaXRBc3luY1N0b3JhZ2VcbiAgICB9KTtcbn1cbmV4cG9ydCB7IHJvdXRlTW9kdWxlLCB3b3JrQXN5bmNTdG9yYWdlLCB3b3JrVW5pdEFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MsIHBhdGNoRmV0Y2gsICB9O1xuXG4vLyMgc291cmNlTWFwcGluZ1VSTD1hcHAtcm91dGUuanMubWFwIl0sIm5hbWVzIjpbXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fcron%2Fpoll-oem%2Froute&page=%2Fapi%2Fcron%2Fpoll-oem%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fcron%2Fpoll-oem%2Froute.ts&appDir=%2FUsers%2Fraahilmehta%2FDesktop%2Fsolarassistprod%2Ffrontend%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fraahilmehta%2FDesktop%2Fsolarassistprod%2Ffrontend&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true!":
/*!******************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true! ***!
  \******************************************************************************************************/
/***/ (() => {



/***/ }),

/***/ "(ssr)/./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true!":
/*!******************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true! ***!
  \******************************************************************************************************/
/***/ (() => {



/***/ }),

/***/ "(rsc)/./app/api/cron/poll-oem/route.ts":
/*!****************************************!*\
  !*** ./app/api/cron/poll-oem/route.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   GET: () => (/* binding */ GET)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n\n/**\n * Cron: poll every OEM integration, normalize into telemetry + alerts tables.\n * Delegates trigger to the Python FastAPI backend `/api/sync` endpoint.\n */ async function GET(req) {\n    const authHeader = req.headers.get(\"authorization\");\n    const secret = req.nextUrl.searchParams.get(\"secret\");\n    const cronSecret = process.env.CRON_SECRET;\n    const isAuthorized = !cronSecret || secret === cronSecret || authHeader === `Bearer ${cronSecret}`;\n    if (!isAuthorized) {\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: \"unauthorized\"\n        }, {\n            status: 401\n        });\n    }\n    const backendUrl = process.env.PYTHON_BACKEND_URL || \"http://127.0.0.1:8000\";\n    console.log(`Forwarding poll-oem cron trigger to Python backend at: ${backendUrl}/api/sync`);\n    try {\n        const res = await fetch(`${backendUrl}/api/sync`, {\n            method: \"POST\",\n            headers: {\n                \"Content-Type\": \"application/json\",\n                \"Authorization\": `Bearer ${cronSecret || \"\"}`\n            },\n            body: JSON.stringify({\n                trigger_source: \"vercel_cron\"\n            })\n        });\n        if (!res.ok) {\n            const errText = await res.text();\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: `Python backend returned status ${res.status}: ${errText}`\n            }, {\n                status: 500\n            });\n        }\n        const data = await res.json();\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            ok: true,\n            backendResponse: data\n        });\n    } catch (err) {\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: `Failed to communicate with Python backend: ${err.message}`\n        }, {\n            status: 500\n        });\n    }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL2Nyb24vcG9sbC1vZW0vcm91dGUudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBNkQ7QUFFN0Q7OztDQUdDLEdBQ00sZUFBZUMsSUFBSUMsR0FBZ0I7SUFDeEMsTUFBTUMsYUFBYUQsSUFBSUUsT0FBTyxDQUFDQyxHQUFHLENBQUM7SUFDbkMsTUFBTUMsU0FBU0osSUFBSUssT0FBTyxDQUFDQyxZQUFZLENBQUNILEdBQUcsQ0FBQztJQUM1QyxNQUFNSSxhQUFhQyxRQUFRQyxHQUFHLENBQUNDLFdBQVc7SUFFMUMsTUFBTUMsZUFDSixDQUFDSixjQUNESCxXQUFXRyxjQUNYTixlQUFlLENBQUMsT0FBTyxFQUFFTSxZQUFZO0lBRXZDLElBQUksQ0FBQ0ksY0FBYztRQUNqQixPQUFPYixxREFBWUEsQ0FBQ2MsSUFBSSxDQUFDO1lBQUVDLE9BQU87UUFBZSxHQUFHO1lBQUVDLFFBQVE7UUFBSTtJQUNwRTtJQUVBLE1BQU1DLGFBQWFQLFFBQVFDLEdBQUcsQ0FBQ08sa0JBQWtCLElBQUk7SUFDckRDLFFBQVFDLEdBQUcsQ0FBQyxDQUFDLHVEQUF1RCxFQUFFSCxXQUFXLFNBQVMsQ0FBQztJQUUzRixJQUFJO1FBQ0YsTUFBTUksTUFBTSxNQUFNQyxNQUFNLEdBQUdMLFdBQVcsU0FBUyxDQUFDLEVBQUU7WUFDaERNLFFBQVE7WUFDUm5CLFNBQVM7Z0JBQ1AsZ0JBQWdCO2dCQUNoQixpQkFBaUIsQ0FBQyxPQUFPLEVBQUVLLGNBQWMsSUFBSTtZQUMvQztZQUNBZSxNQUFNQyxLQUFLQyxTQUFTLENBQUM7Z0JBQ25CQyxnQkFBZ0I7WUFDbEI7UUFDRjtRQUVBLElBQUksQ0FBQ04sSUFBSU8sRUFBRSxFQUFFO1lBQ1gsTUFBTUMsVUFBVSxNQUFNUixJQUFJUyxJQUFJO1lBQzlCLE9BQU85QixxREFBWUEsQ0FBQ2MsSUFBSSxDQUFDO2dCQUN2QkMsT0FBTyxDQUFDLCtCQUErQixFQUFFTSxJQUFJTCxNQUFNLENBQUMsRUFBRSxFQUFFYSxTQUFTO1lBQ25FLEdBQUc7Z0JBQUViLFFBQVE7WUFBSTtRQUNuQjtRQUVBLE1BQU1lLE9BQU8sTUFBTVYsSUFBSVAsSUFBSTtRQUMzQixPQUFPZCxxREFBWUEsQ0FBQ2MsSUFBSSxDQUFDO1lBQUVjLElBQUk7WUFBTUksaUJBQWlCRDtRQUFLO0lBQzdELEVBQUUsT0FBT0UsS0FBVTtRQUNqQixPQUFPakMscURBQVlBLENBQUNjLElBQUksQ0FBQztZQUN2QkMsT0FBTyxDQUFDLDJDQUEyQyxFQUFFa0IsSUFBSUMsT0FBTyxFQUFFO1FBQ3BFLEdBQUc7WUFBRWxCLFFBQVE7UUFBSTtJQUNuQjtBQUNGIiwic291cmNlcyI6WyIvVXNlcnMvcmFhaGlsbWVodGEvRGVza3RvcC9zb2xhcmFzc2lzdHByb2QvZnJvbnRlbmQvYXBwL2FwaS9jcm9uL3BvbGwtb2VtL3JvdXRlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IE5leHRSZXNwb25zZSwgdHlwZSBOZXh0UmVxdWVzdCB9IGZyb20gXCJuZXh0L3NlcnZlclwiO1xuXG4vKipcbiAqIENyb246IHBvbGwgZXZlcnkgT0VNIGludGVncmF0aW9uLCBub3JtYWxpemUgaW50byB0ZWxlbWV0cnkgKyBhbGVydHMgdGFibGVzLlxuICogRGVsZWdhdGVzIHRyaWdnZXIgdG8gdGhlIFB5dGhvbiBGYXN0QVBJIGJhY2tlbmQgYC9hcGkvc3luY2AgZW5kcG9pbnQuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBHRVQocmVxOiBOZXh0UmVxdWVzdCkge1xuICBjb25zdCBhdXRoSGVhZGVyID0gcmVxLmhlYWRlcnMuZ2V0KFwiYXV0aG9yaXphdGlvblwiKTtcbiAgY29uc3Qgc2VjcmV0ID0gcmVxLm5leHRVcmwuc2VhcmNoUGFyYW1zLmdldChcInNlY3JldFwiKTtcbiAgY29uc3QgY3JvblNlY3JldCA9IHByb2Nlc3MuZW52LkNST05fU0VDUkVUO1xuXG4gIGNvbnN0IGlzQXV0aG9yaXplZCA9IFxuICAgICFjcm9uU2VjcmV0IHx8XG4gICAgc2VjcmV0ID09PSBjcm9uU2VjcmV0IHx8XG4gICAgYXV0aEhlYWRlciA9PT0gYEJlYXJlciAke2Nyb25TZWNyZXR9YDtcblxuICBpZiAoIWlzQXV0aG9yaXplZCkge1xuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IGVycm9yOiBcInVuYXV0aG9yaXplZFwiIH0sIHsgc3RhdHVzOiA0MDEgfSk7XG4gIH1cblxuICBjb25zdCBiYWNrZW5kVXJsID0gcHJvY2Vzcy5lbnYuUFlUSE9OX0JBQ0tFTkRfVVJMIHx8IFwiaHR0cDovLzEyNy4wLjAuMTo4MDAwXCI7XG4gIGNvbnNvbGUubG9nKGBGb3J3YXJkaW5nIHBvbGwtb2VtIGNyb24gdHJpZ2dlciB0byBQeXRob24gYmFja2VuZCBhdDogJHtiYWNrZW5kVXJsfS9hcGkvc3luY2ApO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goYCR7YmFja2VuZFVybH0vYXBpL3N5bmNgLCB7XG4gICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgICAgXCJBdXRob3JpemF0aW9uXCI6IGBCZWFyZXIgJHtjcm9uU2VjcmV0IHx8IFwiXCJ9YFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgdHJpZ2dlcl9zb3VyY2U6IFwidmVyY2VsX2Nyb25cIlxuICAgICAgfSlcbiAgICB9KTtcblxuICAgIGlmICghcmVzLm9rKSB7XG4gICAgICBjb25zdCBlcnJUZXh0ID0gYXdhaXQgcmVzLnRleHQoKTtcbiAgICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IFxuICAgICAgICBlcnJvcjogYFB5dGhvbiBiYWNrZW5kIHJldHVybmVkIHN0YXR1cyAke3Jlcy5zdGF0dXN9OiAke2VyclRleHR9YCBcbiAgICAgIH0sIHsgc3RhdHVzOiA1MDAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlcy5qc29uKCk7XG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgb2s6IHRydWUsIGJhY2tlbmRSZXNwb25zZTogZGF0YSB9KTtcbiAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyBcbiAgICAgIGVycm9yOiBgRmFpbGVkIHRvIGNvbW11bmljYXRlIHdpdGggUHl0aG9uIGJhY2tlbmQ6ICR7ZXJyLm1lc3NhZ2V9YCBcbiAgICB9LCB7IHN0YXR1czogNTAwIH0pO1xuICB9XG59XG4iXSwibmFtZXMiOlsiTmV4dFJlc3BvbnNlIiwiR0VUIiwicmVxIiwiYXV0aEhlYWRlciIsImhlYWRlcnMiLCJnZXQiLCJzZWNyZXQiLCJuZXh0VXJsIiwic2VhcmNoUGFyYW1zIiwiY3JvblNlY3JldCIsInByb2Nlc3MiLCJlbnYiLCJDUk9OX1NFQ1JFVCIsImlzQXV0aG9yaXplZCIsImpzb24iLCJlcnJvciIsInN0YXR1cyIsImJhY2tlbmRVcmwiLCJQWVRIT05fQkFDS0VORF9VUkwiLCJjb25zb2xlIiwibG9nIiwicmVzIiwiZmV0Y2giLCJtZXRob2QiLCJib2R5IiwiSlNPTiIsInN0cmluZ2lmeSIsInRyaWdnZXJfc291cmNlIiwib2siLCJlcnJUZXh0IiwidGV4dCIsImRhdGEiLCJiYWNrZW5kUmVzcG9uc2UiLCJlcnIiLCJtZXNzYWdlIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./app/api/cron/poll-oem/route.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fapi%2Fcron%2Fpoll-oem%2Froute&page=%2Fapi%2Fcron%2Fpoll-oem%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fcron%2Fpoll-oem%2Froute.ts&appDir=%2FUsers%2Fraahilmehta%2FDesktop%2Fsolarassistprod%2Ffrontend%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fraahilmehta%2FDesktop%2Fsolarassistprod%2Ffrontend&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();