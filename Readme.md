# domvm-MobX

[MobX](https://mobx.js.org/) bindings for [domvm](https://github.com/domvm/domvm).

Use the `observer()` function to turn domvm views into reactive views.

A reactive view (or an observer view) tracks which observables are used by `render()` and automatically [redraws](https://github.com/domvm/domvm#isolated-redraw) itself when one of these values changes. It also automatically [short-circuits](https://github.com/domvm/domvm#view-change-assessment) the redraw calls as long as the observable data didn't change. All this allows views to render independently from their parent.

The greatest benefit is that you don't need to manage the redrawings manually. Another benefit is that it reduces the redrawing time when only parts of the page are updated. In most cases this is not noticeable, as domvm is already pretty fast. But it is nice when you have to frequently update small parts of a page.

Size: 0.7k minified + gzipped.

### Compatibility  

domvm 3.4.7+  
Should work with MobX 4.5+ and 5.5+ (No idea about older versions)  
Only tested with MobX 5.5+  
IE 9+  

### Keying views

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

#### Technical explanation:

In normal domvm, it is usually not needed to key the sub-views (except for optimizations or when you want to access/modify the generated DOM): if you don't use keys, domvm will reuse the wrong vm but as it will completely redraw it, you still get the correct result. On the other hand, with unkeyed reactive sub-views, when domvm reuses the wrong `vm`, the `vm` can't know that it is being reused, so it skips the redrawing because it is not stale.

## Simple example

The `observer()` function accepts all the 3 different ways that views can be defined with domvm. This example shows that by using the 3 different ways for the 3 different views:

```javascript
var el = domvm.defineElement,
    // The observer() function is exposed on domvm:
    observer = domvm.mobxObserver,
    observable = mobx.observable;

var myState = observable({ name: "World" });

var MyView = observer(function(vm) {
    return function() {
        return el("div", "Hello " + myState.name + "!");
    };
});

var YourView = observer(function(vm) {
    return {  // The render() function
        render: function() {
            return el("div", "Hello " + myState.name + "!");
        }
    };
});

var SomeView = observer({
    render: function() {
        return el("div", "Hello " + myState.name + "!");
    }
});

// This will display: "Hello World!"
var myView = domvm.createView(MyView, myState).mount(document.body);

// This will redraw and display: "Hello everyone!"
myState.name = "everyone";
```

## Complete example

Again with the 3 different ways to define the views.  
Note that we will need to key the `vm`s of one of the views because it is used in a dynamic list.

```javascript
var el = domvm.defineElement,
    vw = domvm.defineView,
    observer = domvm.mobxObserver,  // The observer() function.
    observable = mobx.observable,
    action = mobx.action;

// Use synchronous redraws to follow changes in realtime:
domvm.config({ syncRedraw: true });

var appState = observable({
    users: [
        {name: "Dave", car: "BMW"},
        {name: "Johnny", car: false},
        {name: "Sarah", car: "Toyota"},
        {name: "Peter", car: "Volkswagen"},
    ],
    // A mobx computed value (automatically caches and recomputes its result):
    get usersWithCar() {
        return this.users.filter(user => user.car !== false);
    },
    // Set to true to display only users with a car in the user interface:
    filterCar: false,
});


var App = observer({
    init: function(vm) {
        // To limit the number of displayed users in the user interface.
        // We create a new boxed observable so that render() can react to its changes.
        // The boxed observable is initialized with the value 0:
        vm.limitResults = observable.box(0);
    },
    onToggleLimit: action(function(e, node, vm) {
        console.log("Toggle list limit:", vm.limitResults.get() === 0);
        vm.limitResults.set(vm.limitResults.get() > 0 ? 0 : 2);
    }),
    toggleFilterUnavailable: action(function() {
        console.log("Set filter users with car:", appState.filterCar);
        appState.filterCar = !appState.filterCar;
    }),
    setName: action(function(name) {
        console.log("Set name of first user to:", name);
        appState.users[0].name = name;
    }),
    setCar: action(function(car) {
        console.log("Set car of first user to:", car);
        appState.users[0].car = car;
    }),
    render: function(vm, state) {
        console.log("Render: App");
        return el("div", [
            el("span", "Toggle: "),
            el("button", {onclick: [App.toggleFilterUnavailable]}, "Filter users with car"),
            el("button", {onclick: [App.onToggleLimit]}, "List limit"),
            el("div", [
                "First user name: ",
                el("button", {onclick: [App.setName, "Dave"]}, "Dave"),
                el("button", {onclick: [App.setName, "Jessica"]}, "Jessica"),
            ]),
            el("div", [
                " First user car: ",
                el("button", {onclick: [App.setCar, "BMW"]}, "BMW"),
                el("button", {onclick: [App.setCar, "Ferrari"]}, "Ferrari"),
                el("button", {onclick: [App.setCar, false]}, "No car"),
            ]),
            el("div", "Our users:"),
            vw(UsersList, {
                state: state,  // Don't dereference state.users here.
                limitResults: vm.limitResults,  // Don't unbox the value here.
            }),
        ]);
    }
});

var UsersList = observer(function UsersList() {
    return function(vm, data) {  // The render() function
        console.log("Render: UsersList");
            var state = data.state,
                users = state.filterCar ? state.usersWithCar : state.users,
                limitResults = data.limitResults.get();
            if (limitResults > 0) users = users.filter((user, i) => i < limitResults);
            // Because this list is dynamic, we MUST key the views.
            // Here we use the user name which is unique:
            return el("ul", users.map((user) => vw(User, user, user.name)));
    };
});

var User = observer(function User(vm) {
    return {
        render: function(vm, user) {
            console.log("Render: User");
            var car = user.car !== false ? "a " + user.car : "no";
            return el("li", "Name: " + user.name + ". Has " + car + " car.");
        }
    };
});

console.log("Mounting: App...");
var app = domvm.createView(App, appState).mount(document.body);
console.log('=> First render done.');

console.log("Action: Changing car of first user to Ferrari...");
appState.users[0].car = "Ferrari";
console.log('=> Only 1 "User" has been re-rendered.');

console.log("Action: Limiting the number of displayed users to 2...");
app.limitResults.set(2);
console.log('=> Only the "UsersList" has been re-rendered.');

console.log("Action: Removing limit on number of displayed users...");
app.limitResults.set(0);
console.log('=> Only the "UsersList" and 2 "User" have been re-rendered.');

console.log("Action: Activate car filter...");
appState.filterCar = true;
console.log('=> Only the "UsersList" has been re-rendered.');

console.log("Action: Changing name of first user to Jessica...");
appState.users[0].name = "Jessica";
console.log('=> Only the "UsersList" and 1 "User" has been re-rendered.');
```


## Additional lifecycle hook: `becomeStale(vm, data)`
This new [lifecycle hook](https://github.com/domvm/domvm#lifecycle-hooks) is called when the observed data has changed. It is responsible for redrawing the `vm`. All reactive views are setup with a default `becomeStale()` hook which schedules an async redraw.

So if you want to change the default behavior, you can either set it to false to disable it or to your own function to replace the default hook. You are then responsible for scheduling the redraw.


## FAQ

### When to apply observer() ?

The simple rule of thumb is: all views that render observable data. Even the small ones.  
If you don't want to mark a view as observer, make sure you only pass it plain data.


### What is the ideal size of a reactive view ?

With reactive views: the smaller the views, the smaller the changes they have to re-render, the more the independent parts of the page have the possibility to render independently of each other.  
Contrary to [advices for normal views](https://github.com/domvm/domvm#sub-views-vs-sub-templates), reactive views can be smaller without decreasing the performance after the first render. Simply because while they are not stale, they short-circuit all the work needed during re-rendering (vtree regeneration, diffing and dom reconciliation). So you can make more and smaller views than you would otherwise.  
But don't make them excessively small and many. Because that will require a bit more memory and a bit of performance overhead when they are rendered (like during the page first render).  
Think in terms of units of changes in your data and what part of the page would be affected and re-rendered.  
If you hesitate between a bit smaller or a bit larger, it is usually better to make your view a bit larger, because it is usually better to design for larger changes than for smaller ones which are already going to be fast.

### How to pass observable data ?

Remember that only the _properties_ are observable, not the _values_. So you must always [dereference the values](https://mobx.js.org/best/pitfalls.html#dereference-values-as-late-as-possible) _inside_ your view's `render()` method.  
And obviously, reactive views [only track data that is accessed during the `render()` method](https://mobx.js.org/best/pitfalls.html#don-t-copy-observables-properties-and-store-them-locally).  
Other than that, there is no difference from a normal domvm view.

### Can I use a `diff()` function ?
In general a [`diff()`](https://github.com/domvm/domvm#view-change-assessment) function should be avoided as MobX will efficiently manage redraws by itself. But if you want to force a redraw while the observer is not stale, you can provide your `diff()` function. That function will always be executed as expected, but it won't prevent the redraws when the observer is stale.