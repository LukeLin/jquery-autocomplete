/**
 * IM的搜索
 * Created by Luke on 2015/1/7.
 */
S.c.ImSearch = (function(){

    function isLengthUnit(x){
        return /^[+=]?(?:\d*\.?)\d+(?:px|em|rem)$/.test(x);
    }

    function AutoComplete(opts){
        // 输入框
        this.$input = $(opts.input);
        // 指定显示层的宽高和坐标
        this.width = opts.width;
        this.height = opts.height;
        this.x = isLengthUnit(opts.x) && opts.x;
        this.y = isLengthUnit(opts.y) && opts.y;
        this.noMatchTpl = opts.noMatchTpl;
        this.delay = typeof opts.delay === 'number' ? opts.delay : 500;
        this.fold = opts.fold || false;

        // 是否生成显示层容器
        if(opts.wrapper) this.wrapper = opts.wrapper;
        else {
            this.wrapper = $('<div class="im-searchbar-wrapper" style="display:none;"></div>');
            this.wrapper.appendTo(document.body);
        }

        this.lastNoMatchKey = '';

        // 搜索器队列
        this.handlerQueue = [];

        // 通过es6的Map数据结构来解决异步共用问题，减少请求数
        if(Map) this.getDataMap = new Map();

        this.init();
    }
    AutoComplete.prototype = {
        constructor: AutoComplete,
        init: function(){
            var me = this;
            var timer = null;

            this.$input.on('keydown', function(e){
                if(timer) clearTimeout(timer);

                timer = setTimeout(function(){
                    me.wrapper.show();

                    var key = me.$input.val();
                    me.search(key);
                    if(key === '') me.wrapper.hide();

                    clearTimeout(timer);
                    timer = null;
                }, me.delay);
            })
            .on('paste', function(e){
                    $(e.currentTarget).trigger('keydown');
                })
            .on('click', function(e){
                    e.preventDefault();
                })
            .on('focus', function(){
                    var key = me.$input.val();
                    if(key !== '') me.wrapper.show();
                })
            .on('blur', function(){
                    if(!mouseDownOnSelect) me.wrapper.hide();
                });

            var mouseDownOnSelect = false;
            me.wrapper.on('mousedown', function(){
                mouseDownOnSelect = true;
            })
            .on('mouseup', function(){
                    mouseDownOnSelect = false;
                });

            this.locate();
        },
        // 显示层定位计算
        locate: function(){
            var width = this.$input.outerWidth();
            var height = this.$input.outerHeight();
            var offset = this.$input.offset();
            var left = offset.left;
            var top = offset.top + height;

            this.wrapper.css({
                position: 'absolute',
                width: this.width || width,
                height: this.height || height,
                left: this.x || left,
                top: this.y || top
            });

            return this.wrapper;
        },
        // 添加搜索器
        addSearcher: function(opts){
            opts.fold = opts.fold != null ? opts.fold : this.fold;
            var item = new ResultItem(opts);
            this.handlerQueue.push(item);
            this.wrapper.append(item.container);

            if(this.getDataMap) {
                if(this.getDataMap.has(item.getData))
                    item.cacheResp = this.getDataMap.get(item.getData);
                else
                    this.getDataMap.set(item.getData, (item.cacheResp = {}));
            }

            return this;
        },
        /**
         * 查找操作
         * 搜索器可能有同步获取数据或者异步获取数据，将结果队列显示
         * @param key
         */
        search: function(key){
            if(!this.handlerQueue.length || key === '') return;
            if(this.noMatch) {
                if(this.lastNoMatchKey !== ''
                    && key.length >= this.lastNoMatchKey.length
                    && key.indexOf(this.lastNoMatchKey) === 0)
                    return this.showNoMatch();
                else this.noMatch.hide();
            }

            for(var def, i = 0; i < this.handlerQueue.length; ++i){
                var handler = this.handlerQueue[i];

                if(def && def.pipe) {
                    def.pipe(deferSearch(handler, key));
                } else {
                    var ret = handler.search(key);
                    if(ret && ret.pipe && typeof ret.pipe === 'function') def = ret;
                }
            }

            if(!this.noMatchTpl) return;

            // 没搜到结果
            var me = this;
            if(def && def.pipe) {
                def.then(function(){
                    me.handleNoMatch(key);
                });
            } else this.handleNoMatch(key);
        },

        // 处理没有搜索项的情况
        handleNoMatch: function(key){
            var count = 0;
            for(var i = 0; i < this.handlerQueue.length; ++i){
                if(!this.handlerQueue[i].container.is(':visible')) ++count;
            }

            if(count === this.handlerQueue.length) {
                this.lastNoMatchKey = key;
                this.showNoMatch();
            }
        },

        showNoMatch: function(){
            if(!this.noMatch) {
                this.noMatch = $(this.noMatchTpl);
                this.wrapper.append(this.noMatch);
            }

            for(var i = 0; i < this.handlerQueue.length; ++i){
                this.handlerQueue[i].container.hide();
            }

            this.noMatch.show();
        }
    };

    function deferSearch(handler, key){
        return function(resp){
            return handler.search(key);
        };
    }

    var GUID = 0;

    /**
     * 单项搜索器构造器
     * @param opts
     * @constructor
     */
    function ResultItem(opts){
        // 获取数据的方式，必须是函数
        this.getData = opts.getData;

        var me = this;
        // 是否要折叠功能
        this.fold = opts.fold || false;
        // 搜索结果高亮
        this.highlight = opts.highlight || true;
        // 搜索结果根据关键字过滤
        this.filterBy = opts.filterBy || '*';
        // 格式化数据
        this.formatData = typeof opts.formatData === 'function'
            ? opts.formatData
            : function(){ return me.getData();};
        // 模板
        this.itemTpl = opts.itemTpl;
        //容器构造
        this.container = $('<dl style="display:none;" id="im-search-container' + GUID++ +'" class="im-search-container"><dt class="im-result-title"></dt><dd><ul class="im-result-list"></ul></dd></dl>');
        this.title = opts.title;
        if(this.title) this.container.find('.im-result-title').text(this.title);
        this.list = this.container.find('.im-result-list');

        // 注册结果项点击事件
        if(typeof opts.itemClick === 'function') this.itemClick = opts.itemClick;

        // 缓存器
        this.cache = {};
        this.cacheResp = null;

        this.initEvent();
    }
    ResultItem.prototype = {
        clearList: function(){
            var oldLis = this.list.find('> li');
            for(var i = 0; i < oldLis.length; ++i){
                oldLis.eq(i).removeData('value');
            }
            this.list.empty();
            this.container.removeClass('im-show').hide();
        },

        fillList: function(list, key){
            if(!list.length) {
                if(this.noMatchTpl && typeof this.noMatchTpl === 'function')
                    this.list.append(this.noMatchTpl());
                else this.container.hide();

                return;
            }

            this.container.addClass('im-show').show();
            for(var i = 0; i < list.length; ++i){
                var str = '<li class="im-result-item">';
                var tpl = this.itemTpl && this.itemTpl(list[i], key) || '';
                str += tpl;
                str += '</li>';

                if(this.highlight) {
                    str = str.replace(new RegExp("(?![^&;]+;)(?!<[^<>]*)(" + key.replace(/([\^\$\(\)\[\]\{\}\*\.\+\?\|\\])/gi, "\\$1") + ")(?![^<>]*>)(?![^&;]+;)", "gi"), "<strong>$1</strong>");
                }

                var li = $(str);
                li.data('value', list[i]);
                this.list.append(li);
            }
        },
        // 返回根据关键字过滤后的结果数组
        _filterBy: function(resp, key){
            var arr = [];
            var i, item;

            if(typeof this.filterBy === 'string') {
                if(this.filterBy === '*') {
                    return resp;
                } else {
                    var segs = this.filterBy.replace(/\s+/g, '').split(',');
                    var r_keys = new RegExp('^(?:' + segs.join('|') + ')$');
                    for(i = 0; i < resp.length; ++i){
                        item = resp[i];

                        for(var prop in item){
                            if(!item.hasOwnProperty(prop)) continue;

                            if(r_keys.test(prop)
                                && item[prop]
                                && item[prop].indexOf(key) >= 0) {
                                arr.push(item);
                                break;
                            }
                        }
                    }
                }
            } else if(typeof this.filterBy === 'function') {
                var filter = this.filterBy;
                for(i = 0; i < resp.length; ++i){
                    item = resp[i];

                    if(filter(item, key)) arr.push(item);
                }
            }

            return arr;
        },
        /**
         *
         * @param key
         * @returns {*}
         */
        search: function(key){
            if(key === '') {
                this.clearList();
                return;
            }

            if(this.cache[key] != null) {
                this.clearList();
                this.fillList(this.cache[key], key);
                return this.cache[key];
            }

            var me = this;
            var ret = this.cacheResp[key] || this.getData(key);

            if(!ret) return;

            if(ret.pipe && typeof ret.pipe === 'function') {
                return ret.pipe(function(resp){
                    me.handleData(resp, key);
                });
            } else {
                if(Object.prototype.toString.call(ret) === '[object Array]')
                    return me.handleData(ret, key);
                else throw new Error('data must be an Array');
            }
        },
        initEvent: function(){
            var me = this;
            var timer = null;

            this.container.on('click', 'li.im-result-item', function(e){
                if(timer) return;

                var ele = $(e.currentTarget);
                var data = ele.data('value');

                timer = setTimeout(function(){
                    me.itemClick(e, data);
                    clearTimeout(timer);
                    timer = null;
                }, 300);
            })
            .on('click', '.im-result-title', function(e){
                    var ele = $(e.currentTarget);
                    var wrapper = ele.next();

                    wrapper.toggleClass('im-search-fold').toggle();
                    ele.toggleClass('fold');
                });
        },
        handleData: function handleData(resp, key){
            resp = typeof this.formatData === 'function' ? this.formatData(resp, key) : resp;
            var arr = this._filterBy(resp, key);

            this.cacheResp[key] = resp;
            this.cache[key] = arr;
            this.clearList();
            this.fillList(arr, key);

            return arr;
        }
    };

    return AutoComplete;
})();
