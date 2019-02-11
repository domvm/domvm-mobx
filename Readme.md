# domvm-MobX

[MobX](https://mobx.js.org/) bindings for [domvm](https://github.com/domvm/domvm).

Provides an `observer(name?, view)` function which turns a domvm view into _reactive view_ (or _observer view_).

A _reactive view_ tracks which MobX observables are used by the view's `render()` method and redraws itself automatically when it becomes stale as a result of a change to these observables. It also prevents unnecessary redrawings as long as it is not stale.

Benefits:
- no more imperative redraw code (forget about `vm.redraw()`), your views are never stale.
- views are re-rendered only when strictly needed.

Size: 0.8k minified + gzipped.

### When should I use domvm-MobX ?

I recommend only using this in more complex or larger projects because MobX is a large library that adds a small constant overhead to every computations. So you actually end up with a first render that is slower after you add MobX. Also my personal experience shows that a partial render with MobX is usually not faster than a full render with only domvm because of domvm's diffing and reconciliation speed.

Recommended for projects with:
- a complex update or redraw logic, because MobX can completely handle that for you.
- multiple persons working on the same project, to prevent synchronization mistakes and staling views.
- a page with many elements but small and frequent redraws.

### Compatibility  

domvm 3.4.8+  
Should work with MobX 4.5+ and 5.5+ (No idea about older versions)  
Only tested with MobX 5.5+  
IE 9+  

### Keying views /!\ IMPORTANT /!\

When you generate a dynamic list of reactive sub-views, you **MUST** key those sub-views. A dynamic list is a list where a future redraw might insert, remove, or change the order of the sub-view `vm`s.

Keys do not need to be strings; they can be numbers, objects or functions. But it needs to be unique among its siblings. (More infos: [Keys & DOM Recycling](https://github.com/domvm/domvm#keys--dom-recycling))

Here is how to add keys for sub-views:
```javascript
var vw = domvm.defineView;

// Inside a render function:
render: function(vm) {
    // ...
    vw(MyView, {data}, "myKey")
    // ...
}
```

#### Keying views: technical explanation

In normal domvm, it is usually not needed to key the sub-views (except for optimizations or when you want to access/modify the generated DOM): if you don't use keys, domvm will reuse the wrong `vm` but as it will completely redraw it, you still get the correct result. On the other hand, with reactive sub-views, an unkeyed `vm` doesn't know when it is being reused for another `vm`, and it may actively prevent being re-rendered, resulting in a stale situation.

### Naming your observers for debugging

Set the name as the first parameter: `observer(name?, view)`  
And debug with a call to [`mobx.trace()`](https://mobx.js.org/best/trace.html) inside your view's `render()` method.

Alternatively, the name can be automatically inferred from the view if it is a named function, or if it is a plain object with a `name` property. So these are equivalent:
```javascript
// Explicit names:
observer("MyView", function(vm) {…});
observer("MyView", {render: function(vm) {…}});

// Inferred names:
observer(function MyView(vm) {…});
observer({name: "MyView", render: function(vm) {…}});
```

### Additional lifecycle hook: `becameStale(vm, data)`

This new [lifecycle hook](https://github.com/domvm/domvm#lifecycle-hooks) is called when the observed data has changed. It is responsible for redrawing the `vm`. Thus by default, all reactive views are setup with a default `becameStale()` hook which schedules an async redraw.

So if you want to change the default behavior, you can either set it to false to disable it or to your own function to replace the default hook. You are then responsible for scheduling the redraw.



## Simple example

The `observer()` function accepts all the 3 different ways that views can be defined with domvm. This example shows that by using the 3 different ways for the 3 different views:

```javascript
var el = domvm.defineElement,
    observable = mobx.observable,
    // The observer() function is exposed on domvm:
    observer = domvm.mobxObserver;

var myState = observable({ name: "World" });

// Three equivalent views with the same render() method:

var MyView = observer("MyView", function(vm) {
    return function() {  // The render() function
        return el("div", "Hello " + myState.name + "!");
    };
});

var YourView = observer(function YourView(vm) {
    return {
        render: function() {
            return el("div", "Hello " + myState.name + "!");
        }
    };
});

var SomeView = observer("SomeView", {
    render: function() {
        return el("div", "Hello " + myState.name + "!");
    }
});

// This will display: "Hello World!"
var myView = domvm.createView(MyView, myState).mount(document.body);

// This will redraw and display: "Hello everyone!"
myState.name = "everyone";
```


## Complete demo

Try the online [domvm-MobX demo in the playground](https://domvm.github.io/domvm/demos/playground/#mobx)


## FAQ

### When to apply observer() ?

The simple rule of thumb is: all views that render observable data. Even the small ones.  
If you don't want to mark a view as observer, make sure you only pass it plain data.

### How to pass observable data ?

Remember that only the _properties_ are observable, not the _values_. So you must always [dereference the values](https://mobx.js.org/best/pitfalls.html#dereference-values-as-late-as-possible) _inside_ your view's `render()` method.  
And obviously, reactive views [only track data that is accessed _during_ the `render()` method](https://mobx.js.org/best/pitfalls.html#don-t-copy-observables-properties-and-store-them-locally).  
Other than that, there is no difference from a normal domvm view.

### Can I use a `diff()` function ?
In general a [`diff()`](https://github.com/domvm/domvm#view-change-assessment) function should be avoided as MobX will efficiently manage redraws by itself. You can still provide your `diff()` function if you want to force a re-render while the observer is not stale. But when it is stale, it is always re-rendered, whatever your `diff()` function returns.