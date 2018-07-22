open Jest
open Expect
open Test_helper

let () =
  describe "Table" begin fun () ->
    let open Table in

    describe "create" begin fun () ->
      test "it should create a table" begin fun () ->
        let h = Some ["name"; "color"] in
        let b = [
          ["apple"; "red"];
          ["banana"; "yellow"];
          ["lime"];
        ] in
        let a = [None] in
        let table = create ~header:h ~body:b ~alignments:a in
        expect (
          header table,
          body table,
          alignments table
        ) |> toEqual (h, b, a)
      end;
    end;

    describe "Normalized" begin fun () ->
      let open Normalized in

      describe "create" begin fun () ->
        describe "with header" begin fun () ->
          test "it should be able to create a normalized table" begin fun () ->
            let h = Some ["name"; "color"] in
            let b = [
              ["apple"; "red"];
              ["banana"; "yellow"];
              ["lime"; "green"];
            ] in
            let a = [None; Some Alignment.Left] in
            let table = create ~header:h ~body:b ~alignments:a in
            expect (
              header table,
              body table,
              alignments table,
              width table
            ) |> toEqual (h, b, a, 2)
          end;

          test "it should fail if there are no columns" begin fun () ->
            let h = Some [] in
            let b = [[]; []; []] in
            let a = [] in
            expect (fun () -> create ~header:h ~body:b ~alignments:a)
            |> toThrowAssertionFailure
          end;

          test "it should fail if there exists a column of diffrent width" begin fun () ->
            let h = Some ["name"; "color"] in
            let b = [
              ["apple"; "red"];
              ["banana"];
              ["lime"; "green"];
            ] in
            let a = [None; Some Alignment.Left] in
            expect (fun () -> create ~header:h ~body:b ~alignments:a)
            |> toThrowAssertionFailure
          end;

          test "it should fail if there exists a column without alignment" begin fun () ->
            let h = Some ["name"; "color"] in
            let b = [
              ["apple"; "red"];
              ["banana"; "yellow"];
              ["lime"; "green"];
            ] in
            let a = [None] in
            expect (fun () -> create ~header:h ~body:b ~alignments:a)
            |> toThrowAssertionFailure
          end;
        end;

        describe "without header" begin fun () ->
          test "it should be able to create a normalized table" begin fun () ->
            let b = [
              ["apple"; "red"];
              ["banana"; "yellow"];
              ["lime"; "green"];
            ] in
            let a = [None; Some Alignment.Left] in
            let table = create ~header:None ~body:b ~alignments:a in
            expect (
              header table,
              body table,
              alignments table,
              width table
            ) |> toEqual (None, b, a, 2)
          end;

          test "it should fail if there are no columns" begin fun () ->
            let b = [[]; []; []] in
            let a = [] in
            expect (fun () -> create ~header:None ~body:b ~alignments:a)
            |> toThrowAssertionFailure
          end;

          test "it should fail if there exists a column of diffrent width" begin fun () ->
            let b = [
              ["apple"; "red"];
              ["banana"];
              ["lime"; "green"];
            ] in
            let a = [None; Some Alignment.Left] in
            expect (fun () -> create ~header:None ~body:b ~alignments:a)
            |> toThrowAssertionFailure
          end;

          test "it should fail if there exists a column without alignment" begin fun () ->
            let b = [
              ["apple"; "red"];
              ["banana"; "yellow"];
              ["lime"; "green"];
            ] in
            let a = [None] in
            expect (fun () -> create ~header:None ~body:b ~alignments:a)
            |> toThrowAssertionFailure
          end;

          test "it should fail if there are no header nor body" begin fun () ->
            let b = [] in
            let a = [] in
            expect (fun () -> create ~header:None ~body:b ~alignments:a)
            |> toThrowAssertionFailure
          end;
        end;
      end;
    end;
  end
