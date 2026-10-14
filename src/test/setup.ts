// jsdom does not implement scrolling; the app calls it when a note opens.
Element.prototype.scrollTo = () => {}
Element.prototype.scrollIntoView = () => {}
