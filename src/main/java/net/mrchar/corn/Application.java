package net.mrchar.corn;

import jakarta.annotation.PostConstruct;
import net.mrchar.corn.model.Category;
import net.mrchar.corn.model.Space;
import net.mrchar.corn.repository.CategoryRepository;
import net.mrchar.corn.repository.SpaceRepository;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.util.List;

@SpringBootApplication
public class Application {
    private final SpaceRepository spaces;
    private final CategoryRepository categories;

    public Application(SpaceRepository spaces, CategoryRepository categories) {
        this.spaces = spaces;
        this.categories = categories;
    }

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }


    @PostConstruct
    public void init() {
        long count = this.spaces.count();
        if (count < 1) {
            Space space = new Space("default", "默认");
            this.spaces.save(space);
        }

        long count1 = this.categories.count();
        if (count1 < 1) {
            List<Category> categories = List.of(
                    new Category("human", "人力"),
                    new Category("money", "资金"));
            this.categories.saveAll(categories);
        }
    }
}
