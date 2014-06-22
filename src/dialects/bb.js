/**
 * TODO: document
 * TODO: simplify the timecode regex
 */
if (typeof define !== 'function') { var define = require('amdefine')(module) }
define(['../markdown_helpers', './dialect_helpers', '../parser'], function (MarkdownHelpers, DialectHelpers, Markdown) {

  var Bb = {
    block: {
    },
    inline: {
    }
  };

  function rpad (n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : n + new Array(width - n.length + 1).join(z);
  }

  function lpad (n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
  }

  function divmod (a, b) {
    return [ Math.floor(a / b), a % b ];
  }

  function ms2tc (ms) {
    var _, ms = ms, ss, mm, hh;

    _ = divmod(ms, 1000);
    ss = _[0];
    ms = _[1];
    
    _ = divmod(ss, 3600);
    hh = _[0];
    ss = _[1];

    _ = divmod(ss, 60);
    mm = _[0];
    ss = _[1];

    ms = parseInt(ms, 10);

    ms = rpad(ms, 3);
    ss = lpad(ss, 2);
    mm = lpad(mm, 2);
    hh = lpad(hh, 2);

    return hh + ':' + mm + ':' + ss + ',' + ms;
  }

  function ss2tc (ss) {
    return ms2tc(ss * 1000);
  }

  function tc2ss (tc) {
    var pattern = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})(?:[,\.](\d+))?$/,
      match = tc.match(pattern),
      ret = NaN;

    if (match) {
      ret = match[1]
        ? parseInt(match[1], 10) * 3600
        : 0;
      ret += parseInt(match[2], 10) * 60;
      ret += parseInt(match[3], 10);
      ret += match[4]
        ? parseFloat('0.' + match[4])
        : 0;
    }

    return ret;
  }


  /**
   * Adds supports for srt-like timed sections.
   */
  Bb.block['slide'] =  function timecode( block, next ) {
    // matches expressions like "%< 00:00:05"
    var re = /^\s{0,3}8<(\s*(((\d{1,2})(:))?(\d\d):(\d\d)([,\.](\d{1,3}))?))?\s*(?:\n|$)/,
      m = block.match( re ),
      begin,
      end;

    // stops here if there is no match
    if ( !m ) {
      return undefined;
    }

    // if not specified, sets the end of the previous timed section with the
    // current value for begin
    var previous = this.tree[this.tree.length - 1],
      previousAttrs = previous[1];

    var dur = m[2] ? tc2ss(m[2]) : 5;

    if (!previousAttrs['data-end']) {
      begin = 0;
      end = dur;
    } else {
      begin = parseFloat(previousAttrs['data-end']);

      if ( !m[2] ) {
        end = begin + (parseFloat(previousAttrs['data-end']) - parseFloat(previousAttrs['data-begin']));
      } else {
        end = begin + dur;
      }
    }

    // collects the content of the timed section; that is the following blocks
    // until an other timed section is found, or the end of the source text is
    // reached.
    var inner = [];

    while (next.length) {
      var found = next[0].match(re);

      if ( found ) { break; }

      inner.push(next.shift());
    }

    // constructs the JSONML to push to the tree
    var attrs = {"typeof": "aa:annotation", "data-begin": "" + begin};
    var section = [ "section", attrs ];
    
    section.push([ "span", {"property": "aa:begin", "content": "" + begin, "datatype": "xsd:float"}, ss2tc(begin) ]);

    // sets the end only if the group was matched
    if (end) {
      attrs["data-end"] = "" + end;
      section.push([ "span", {"property": "aa:end", "content": "" + end, "datatype": "xsd:float"}, ss2tc(end) ]);
    }

    section.push(this.toTree(inner, [ "div", {"property": "aa:content"} ]));

    return [ section ];
  };


  /**
   * Adds supports for srt-like timed sections.
   */
  Bb.block['timecode'] =  function timecode( block, next ) {
    // matches expressions like "00:00:00 --> 00:00:10"
    var re = /^\s{0,3}(((\d{1,2})(:))?(\d\d):(\d\d)([,\.](\d{1,3}))?)\s*-->(\s*(((\d{1,2})(:))?(\d\d):(\d\d)([,\.](\d{1,3}))?))?\s*(?:\n|$)/,
      m = block.match( re );

    // stops here if there is no match
    if ( !m )
      return undefined;

    // references the begin and end groups
    var begin = tc2ss(m[1]),
      end = m[10] ? tc2ss(m[10]) : m[10];

    // if not specified, sets the end of the previous timed section with the
    // current value for begin
    var previous = this.tree[this.tree.length - 1],
      previousAttrs = previous[1];

    if (previousAttrs['data-begin'] && !previousAttrs['data-end']) {
      previousAttrs['data-end'] = "" + begin;
      previous.splice(3, 0, [ "span", {"property": "aa:end", "content": "" + begin, "datatype": "xsd:float", "class": "deduced"}, ss2tc(begin) ]);
    }

    // collects the content of the timed section; that is the following blocks
    // until an other timed section is found, or the end of the source text is
    // reached.
    var inner = [];
    var found;

    while (next.length) {
      found = next[0].match(re);

      if ( found ) { break; }

      inner.push(next.shift());
    }

    // constructs the JSONML to push to the tree
    var attrs = {"typeof": "aa:annotation", "data-begin": "" + begin};
    var section = [ "section", attrs, inner ];
    
    // sets the end only if the group was matched
    if (end) {
      // sets the end if the group was matched
      attrs["data-end"] = "" + end;
    } else if (!found) {
      // if there is no subsequent timed section, and the end time has not been
      // set, it inherits from the begin time
      end = begin;
      attrs["data-end"] = "" + end;
    }

    return [ section ];
  };


  /**
   *  toSRT( markdown ) -> String
   *  - markdown (String): markdown string to parse
   *
   *  Takes markdown (as a string) and turns it into Subrip.
   **/
  Bb.toSRT = function toHTML( source ) {
    var tree = Markdown.parse(source, "Bb");
    var nodes = tree.splice(1);

    var output = "";

    for (var i = 0, l = nodes.length; i < l; i ++) {
      var leaf = nodes[i];

      output += (i + 1) + "\n";
      output += leaf[1]["data-begin"] + " --> " + leaf[1]["data-end"] + "\n";
      for (var j = 0, m = leaf[2].length; j < m; j ++) {
        output += leaf[2][j] + "\n\n";
      }
    }

    return output;
  };


  /**
   *  toAudacity( markdown ) -> String
   *  - markdown (String): markdown string to parse
   *
   *  Takes markdown (as a string) and turns it into Audacity markers.
   **/
  Bb.toAudacity = function toHTML( source ) {
    var tree = Markdown.parse(source, "Bb");
    var nodes = tree.splice(1);

    var output = "";

    for (var i = 0, l = nodes.length; i < l; i ++) {
      var leaf = nodes[i];

      output += leaf[1]["data-begin"] + "\t" + leaf[1]["data-end"] + "\t";

      for (var j = 0, m = leaf[2].length; j < m; j ++) {
        leaf[2][j] = leaf[2][j].replace('\n', '\\n');
      }

      output += leaf[2].join('\\n\\n');

      output += "\n";
    }

    return output;
  };


  Markdown.dialects.Bb = Bb;
  Markdown.buildBlockOrder ( Markdown.dialects.Bb.block );

  return Bb;
});
