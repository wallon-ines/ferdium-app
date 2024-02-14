import { BrowserWindow, Rectangle, ipcMain } from 'electron';

import {
  GET_ACTIVE_SERVICE_WEB_CONTENTS_ID,
  HIDE_ALL_SERVICES,
  NAVIGATE_SERVICE_TO,
  OPEN_SERVICE_DEV_TOOLS,
  RELOAD_SERVICE,
  RESIZE_SERVICE_VIEWS,
  RESIZE_TODO_VIEW,
  SHOW_ALL_SERVICES,
  TODOS_FETCH_WEB_CONTENTS_ID,
  TODOS_OPEN_DEV_TOOLS,
  TODOS_RELOAD,
  USER_LOGIN_STATUS,
} from '../../ipcChannels';
import { ServiceBrowserView } from '../../models/ServiceBrowserView';

const debug = require('debug')('Franz:ipcApi:browserViewManager');

interface IIPCServiceData {
  id: string;
  name: string;
  url: string;
  partition: string;
  state: {
    isActive: boolean;
    isSpellcheckerEnabled: boolean;
    spellcheckerLanguage: string;
    isDarkModeEnabled: boolean;
    team: string;
    hasCustomIcon: boolean;
    isRestricted: boolean;
    isHibernating: boolean;
  };
  recipeId: string;
}

interface IBrowserViewCache {
  id: string;
  browserView: ServiceBrowserView;
}

const browserViews: IBrowserViewCache[] = [];

export default async ({
  mainWindow,
  settings: { app: settings },
}: {
  mainWindow: BrowserWindow;
  settings: any;
}) => {
  // We need to set this for `Recipe.overrideUserAgent()`
  global.window = {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    navigator: {
      userAgent: mainWindow.webContents.getUserAgent(),
    },
  };

  ipcMain.handle(
    'browserViewManager',
    async (event, services: IIPCServiceData[]) => {
      try {
        for (const service of services) {
          try {
            let sbw = browserViews.find(
              bw => bw.id === service.id,
            )?.browserView;

            if (sbw) {
              sbw.update({
                config: {
                  name: service.name,
                  url: service.url,
                },
                state: service.state,
              });
            } else {
              debug('creating new browserview', service.url);

              sbw = new ServiceBrowserView({
                config: {
                  id: service.id,
                  name: service.name,
                  url: service.url,
                  partition: service.partition,
                },
                state: service.state,
                recipeId: service.recipeId,
                window: mainWindow,
                settings,
              });

              sbw.initialize();
              sbw.attach();

              browserViews.push({
                id: service.id,
                browserView: sbw,
              });
            }

            if (sbw.isActive) {
              if (sbw.isRestricted) {
                for (const bw of browserViews) bw.browserView.remove();
              } else {
                setTimeout(() => {
                  sbw.setActive();
                  sbw.focus();
                }, 5);
              }
            }
          } catch (error) {
            console.log('Could not initialize browserView');
            console.log(error);
          }
        }

        for (const service of browserViews.filter(
          bw => !services.some(service => service.id === bw.id),
        )) {
          debug(
            'Removing unused service',
            service.browserView.config.name,
            service.browserView.config.id,
          );

          browserViews.splice(
            browserViews.findIndex(bw => bw.id === service.id),
            1,
          );
          service.browserView.remove();
          service.browserView.destroy();
        }

        // }

        return browserViews.map(view => ({
          serviceId: view.id,
          webContentsId: view.browserView.webContents.id,
        }));
      } catch (error) {
        console.error(error);
      }
    },
  );

  mainWindow.on('focus', () => {
    debug('Window focus, focus browserView');
    const sbw = browserViews.find(
      browserView => browserView.browserView.isActive,
    );
    if (sbw) {
      sbw.browserView.focus();
    }
  });

  mainWindow.webContents.on('did-navigate-in-page', () => {
    const url = mainWindow.webContents.getURL();

    if (url.includes('#/settings')) {
      for (const bw of browserViews) bw.browserView.remove();
    }
  });

  ipcMain.on(OPEN_SERVICE_DEV_TOOLS, (e, { serviceId } = {}) => {
    const sbw = browserViews.find(browserView =>
      serviceId
        ? browserView.id === serviceId
        : browserView.browserView.isActive,
    );

    if (sbw) {
      debug(`Open devTools for service '${sbw.browserView.config.name}'`);
      sbw.browserView.webContents.toggleDevTools();

      if (sbw.browserView.webContents.isDevToolsOpened()) {
        sbw.browserView.webContents.closeDevTools();
      } else {
        sbw.browserView.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  ipcMain.on(TODOS_OPEN_DEV_TOOLS, () => {
    const contents = browserViews.find(
      browserView => browserView.browserView.isTodos,
    )?.browserView.webContents;

    if (contents) {
      if (contents.isDevToolsOpened()) {
        contents.closeDevTools();
      } else {
        contents.openDevTools({ mode: 'detach' });
      }
    }
  });

  ipcMain.on(RELOAD_SERVICE, (e, serviceId = {}) => {
    const sbw = serviceId
      ? browserViews.find(browserView => browserView.id === serviceId)
      : browserViews.find(browserView => browserView.browserView.isActive);

    if (sbw) {
      debug(`Reload service '${sbw.browserView.config.name}'`);
      sbw.browserView.webContents.reload();
    }
  });

  ipcMain.on(TODOS_RELOAD, () => {
    browserViews
      .find(browserView => browserView.browserView.isTodos)
      ?.browserView.webContents.reload();
  });

  ipcMain.on(NAVIGATE_SERVICE_TO, (e, { serviceId, url }) => {
    const sbw = browserViews.find(browserView => browserView.id === serviceId);

    if (sbw) {
      debug(`Navigate service '${sbw.browserView.config.name}' to`, url);
      sbw.browserView.webContents.loadURL(url);
    }
  });

  ipcMain.on(RESIZE_SERVICE_VIEWS, (e, bounds: Rectangle) => {
    debug('Resizing service views by', bounds);

    for (const bw of browserViews.filter(bw => !bw.browserView.isTodos)) {
      bw.browserView.resize(bounds);
    }
  });

  ipcMain.on(RESIZE_TODO_VIEW, (e, bounds: Rectangle) => {
    debug('Resizing todo view by', bounds);

    browserViews
      .find(bw => bw.browserView.isTodos)
      ?.browserView?.resize(bounds);
  });

  ipcMain.on(HIDE_ALL_SERVICES, () => {
    debug('Hiding all services');

    for (const bw of browserViews) bw.browserView.remove();
  });

  ipcMain.on(SHOW_ALL_SERVICES, () => {
    debug('Showing all services');

    if (
      browserViews.find(bw => bw.browserView.isActive)?.browserView.isRestricted
    ) {
      return;
    }

    for (const bw of browserViews) {
      bw.browserView.attach();
      if (bw.browserView.isActive) {
        setTimeout(() => {
          bw.browserView.setActive();
        }, 5);
      }
    }
  });

  ipcMain.handle(TODOS_FETCH_WEB_CONTENTS_ID, () => {
    debug('Retrieving Todos webContentsId');

    const webContentsId = browserViews.find(bw => bw.browserView.isTodos)
      ?.browserView.webContents.id;

    return webContentsId;
  });

  ipcMain.handle(GET_ACTIVE_SERVICE_WEB_CONTENTS_ID, () => {
    debug('Retrieving webContentsId of active servic');

    const webContentsId = browserViews.find(bw => bw.browserView.isActive)
      ?.browserView.webContents.id;

    return webContentsId;
  });

  ipcMain.on(USER_LOGIN_STATUS, (event, isLoggedIn) => {
    debug('User login status changed to', isLoggedIn);

    if (!isLoggedIn) {
      debug('User is logged out, removing all browserViews');
      for (const bw of browserViews) bw.browserView.remove();
      browserViews.splice(0, browserViews.length);
    }
  });
};
