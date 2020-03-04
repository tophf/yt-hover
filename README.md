### A fork of [schomery/youtube-hover](https://github.com/schomery/youtube-hover/)

Fully reworked internally with a couple of minor features added.

![ui](https://i.imgur.com/WfLUOa1.png)

### Draggable and resizable preview:

Click-and-drag the border or the corners to move/resize.

The position/size is changed only for this preview. To set the global size, open the options UI from the toolbar icon menu.

![options](https://i.imgur.com/97amZUs.png)

### Autoplay in Chrome

Chrome has its own allegedly smart heuristics to determine when it can autoplay videos so you may need to give it some time to learn from your behavior.

### Extension permissions

* Optional `history` when you enable "Add previewed links to the browser history" in the extension's options.
* All URLs for the content script that automatically detects youtube link under the mouse cursor.

### How to limit the site permissions

Chrome allows you to easily limit the extension so it can access only a few sites:

<img align="right" alt="permissions" src="https://i.imgur.com/x8Yt4OE.png">

* right-click the extension icon in the toolbar (or browser menu) and click "Manage" - it'll open chrome://extensions details page for this extension
* click "On specific sites" and enter the URL you want to allow
* to add more sites either a) click "Add a new page" and type/paste the URL or b) simply visit a page and click the extension icon, then confirm the site name in "This can read and change site data" sub-menu:

  ![permissions-add](https://i.imgur.com/mZE2lYi.png) 
