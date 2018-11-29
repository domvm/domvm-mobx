/*! domvm-MobX v0.0 - Jean-Louis Grall - MIT License - https://github.com/jlgrall/domvm-mobx */
(function(domvm, mobx, undefined) {
"use strict";


// UTILS:

// We want the same checks as domvm:
function isPlainObj(val) {	// See: https://github.com/domvm/domvm/blob/master/src/utils.js#L17
	return val != undefined && val.constructor === Object;		//  && typeof val === "object"
}
function isFunc(val) {	// See: https://github.com/domvm/domvm/blob/master/src/utils.js#L30
	return typeof val === "function";
}



// DESIGN:
// 
// We create a new MobX Reaction for each observer domvm vm (ViewModel).
// The Reaction is used to track the observables used by the render() method. It becomes stale
// when one of the tracked observables changes. Upon becoming stale, the default becomeStale() hook
// schedules an async redraw of the vm (the user can setup its own becomeStale() hook to change
// the default behavior).
// Lazy rendering: re-rendering is executed only when the observer is stale, which is checked by
// its diff() function. (Rendering can be forced by the user diff() function if setup.)
// Reaction lifecycle: the Reaction is created at the beginning of the vm init(), and destroyed
// during willUnmount(), which allows it to be reclaimed by the GC (usual case). But because the vm
// can be reused, we recreate the Reaction during the render() if we detect that the vm is reused.
// Conclusion: we need to replace four methods/hooks on every observer vm: diff(), init(), render()
// and willUnmount(). And we also need to add one hook: becomeStale().
// Notes:
// - There is no way to know that a vm is being reused before the execution of its diff()
//   method (the willMount() hook is fired after the diff() and the render() methods).
// - The Reaction must be destroyed explicitly to prevent wasting computations and resources.
// 
// Links:
// - domvm ViewModel: https://github.com/domvm/domvm/blob/master/src/view/ViewModel.js
// - MobX Reaction: https://github.com/mobxjs/mobx/blob/5.6.0/src/core/reaction.ts
// - Inspirations:
//   - MobX bindings for Inferno: https://github.com/infernojs/inferno/blob/dev/packages/inferno-mobx/src/observer.ts
//   - mobx-observer (universal bindings): https://github.com/capaj/mobx-observer/blob/master/observer.js
//   - MobX bindings for Preact: https://github.com/mobxjs/mobx-preact


// Turns a vm into an observer (ie. into a reactive view vm):
function initvm(vm, reactionName) {
	// Uncomment if you need to find all unkeyed vm:
	//if (vm.key === undefined) console.warn("Unkeyed reactive view:", reactionName, vm);
	
	var hooks = vm.hooks || (vm.hooks = {});
	
	vm.mobxObserver = {
		// The reaction name, for debugging:
		name: reactionName,
		// The Reaction instance:
		reaction: undefined,
		// If the current view is stale and need (re-)rendering:
		stale: true,
		// The original diff():
		diff: vm.diff && vm.diff.val,	// Before domvm 3.3.3, it was: vm.diff
		// The original render():
		render: vm.render,
		// The original hook willUnmount():
		willUnmount: hooks.willUnmount,
	};
	
	// The user can prevent the default becomeStale() if he did setup its own function,
	// or if he did set it to false:
	if (hooks.becomeStale == undefined) hooks.becomeStale = becomeStale;
	
	vm.config({diff: diff});
	vm.render = render;
	hooks.willUnmount = willUnmount;
	
	setReaction(vm);
}

// Creates the observer Reaction:
function setReaction(vm) {
	var observerData = vm.mobxObserver;
	
	// Useful during development:
	if (observerData.reaction) throw Error("Reaction already set.");
	
	observerData.stale = true;
	observerData.reaction = new mobx.Reaction(observerData.name, function() {
		observerData.stale = true;
		if (vm.hooks.becomeStale) vm.hooks.becomeStale(vm, vm.data);
	});
	
	// The reaction should be started right after creation. (See: https://github.com/mobxjs/mobx/blob/5.6.0/src/core/reaction.ts#L35)
	// But it doesn't seem to be mandatory... ?
	// Not doing it, as that would trigger becomeStale() and a vm.redraw() right now !
	// In case we need it, see convoluted implementation of fireImmediately in MobX autorun(): https://github.com/mobxjs/mobx/blob/5.6.0/src/api/autorun.ts#L146
	//observerData.reaction.schedule();
}

// Destroys the observer Reaction:
function unsetReaction(vm) {
	var observerData = vm.mobxObserver;
	
	// Useful during development:
	if (!observerData.reaction) throw Error("Reaction already unset.");
	
	observerData.reaction.dispose();
	observerData.reaction = undefined;
}

// The default becomeStale() assigned to each observer vm's hooks
function becomeStale(vm) {
	vm.redraw();
}

// The diff() assigned to each observer vm:
function diff(vm) {
	var observerData = vm.mobxObserver,
		// Retrieve previous result:
		vold = vm.node,
		result = vold ? vold._diff : false;	// Before domvm 3.4.0, it was: vm._diff
	
	// We must always execute the diff() function so that it doesn't break future comparisons:
	if (observerData.diff) result = observerData.diff.apply(this, arguments);
	
	if (observerData.stale) {
		// Force render while keeping the current value for future comparisons.
		// Note: before domvm 3.4.7, this trick didn't work. See: https://github.com/domvm/domvm/issues/204
		if (vold) vm.node._diff = !result;	// Before domvm 3.4.0, it was: vm._diff
	}
	return result;
}

// The render() wrapper assigned to each observer vm:
function render(vm) {
	var observerData = vm.mobxObserver,
		that = this,
		args = arguments,
		result;
	
	// If vm was unmounted and is now being reused:
	if (!observerData.reaction) setReaction(vm);
	
	// This can be run even if the reaction is not stale:
	observerData.reaction.track(function() {
		mobx._allowStateChanges(false, function() {
			result = observerData.render.apply(that, args);
		});
	});
	observerData.stale = false;
	
	return result;
}

// The willUnmount() wrapper assigned to each observer vm's hooks:
function willUnmount(vm) {
	unsetReaction(vm);
	
	var _willUnmount = vm.mobxObserver.willUnmount;
	if (_willUnmount) _willUnmount.apply(this, arguments);
}

// Replaces the init() with our own init():
function wrapInit(target, reactionName) {
	target.init = (function(init) {
		return function(vm) {
			initvm(vm, reactionName);
			if (init) init.apply(this, arguments);
		};
	})(target.init);
}

// Replaces the init() with our own init(), but also checks that init() was not already replaced.
// (Useful during development ?)
function wrapInitOnce(target, reactionName) {
	if (!target.init || !target.init.mobxObserver) {
		wrapInit(target, reactionName);
		target.init.mobxObserver = true;
	}
}

// Turns a view into a domvm-MobX observer view:
function observer(view) {
	// Generate friendly name for debugging (See: https://github.com/infernojs/inferno/blob/dev/packages/inferno-mobx/src/observer.ts#L104)
	var reactionName = view.displayName || view.name || (view.constructor && (view.constructor.displayName || view.constructor.name)) || '<View>';
	reactionName += ".render()";
	// TODO: maybe we could also pass the name as the optional first parameter ?
	//       (Like in mobx.action(), see: https://mobx.js.org/refguide/api.html#actions)
	
	
	// We need to hook into the init() of the vm, before that init() is executed, but after
	// all the vm.config(...) have been executed on the vm (because they can change the init()).
	// This is a bit complex depending on the type of the view.
	// Refer to the ViewModel constructor for details:
	//   https://github.com/domvm/domvm/blob/master/src/view/ViewModel.js#L22
	
	if (isPlainObj(view)) {
		// view is an object: just set our own init on it.
		wrapInit(view, reactionName);
	}
	else {
		// view is a function: we can't do anything before it is executed, so we wrap it
		// with a function that will set our own init later.
		view = (function(view) {
			return function(vm) {
				var out = view.apply(this, arguments);
				
				if (isFunc(out)) {
					wrapInit(vm, reactionName);
				}
				else {
					// In case multiple executions of view() returns the same object,
					// we want to wrap init only once:
					wrapInitOnce(out, reactionName);
				}
				
				return out;
			};
		})(view);
	}
	
	return view;
}



// EXPORTS:

domvm.mobxObserver = observer;

})(window.domvm, window.mobx);